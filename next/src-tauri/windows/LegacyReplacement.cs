using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;

internal static class LegacyReplacement
{
    private const string LegacyId = "f6d10ccf-3944-54a9-b8ec-1f95df56a56c";
    private const string InstallKey = @"Software\" + LegacyId;
    private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\" + LegacyId;
    private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string NextId = "com.vaultor.next";
    private const uint OpenObject = 0x02200000; // Backup semantics plus open the reparse object itself.
    private const uint Reparse = 0x400;
    private const uint DirectoryFlag = 0x10;
    private static readonly string[] Versions = { "0.27.0", "0.26.0", "0.25.2" };
    private static readonly string[] ProfileEntries = {
        "appearance.json", "connections.json", "device-credentials.json", "hosting.json",
        "local-workspace", "linked-sources", "file-cache", "workspace-copies", "updates", "prepared-exports",
        "Cache", "Code Cache", "GPUCache", "DawnGraphiteCache", "DawnWebGPUCache", "GPUPersistentCache",
        "GrShaderCache", "ShaderCache", "IndexedDB", "Local Storage", "Session Storage", "blob_storage",
        "Network", "Shared Dictionary", "WebStorage", "Local State", "Preferences", "DIPS", "DIPS-wal", "DIPS-shm",
        "declarative_performance_observer.db", "declarative_performance_observer.db-journal"
    };

    [StructLayout(LayoutKind.Sequential)]
    private struct AttributeTag { public uint Attributes, Tag; }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security,
        uint creation, uint flags, IntPtr template);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle, int kind,
        out AttributeTag value, uint size);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetFileInformationByHandle(SafeFileHandle handle, int kind,
        ref byte value, uint size);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern bool QueryFullProcessImageName(IntPtr process, int flags, StringBuilder name, ref int length);

    private static bool Same(string left, string right)
    {
        return String.Equals(left, right, StringComparison.OrdinalIgnoreCase);
    }

    private static SafeFileHandle Open(string path, uint access, uint share)
    {
        var handle = CreateFile(path, access, share, IntPtr.Zero, 3, OpenObject, IntPtr.Zero);
        if (!handle.IsInvalid) return handle;
        var error = Marshal.GetLastWin32Error();
        handle.Dispose();
        if (error == 2 || error == 3) return null;
        throw new IOException(path, new Win32Exception(error));
    }

    private static uint Attributes(SafeFileHandle handle, string path)
    {
        AttributeTag tag;
        if (!GetFileInformationByHandleEx(handle, 9, out tag, 8))
            throw new IOException(path, new Win32Exception(Marshal.GetLastWin32Error()));
        if ((tag.Attributes & Reparse) != 0)
            throw new IOException("Reparse object retained: " + path);
        return tag.Attributes;
    }

    // Pin every ancestor without delete sharing while using its pathname. This
    // prevents a directory rename or junction substitution during traversal.
    private static void WithAncestors(string path, Action action)
    {
        var parents = new Stack<string>();
        for (var current = Directory.GetParent(path); current != null; current = current.Parent)
            parents.Push(current.FullName);
        var held = new List<SafeFileHandle>();
        try {
            while (parents.Count != 0) {
                var parent = parents.Pop();
                var handle = Open(parent, 0x80, 3);
                if (handle == null) return;
                held.Add(handle);
                if ((Attributes(handle, parent) & DirectoryFlag) == 0)
                    throw new IOException("Unrecognized parent: " + parent);
            }
            action();
        } finally {
            foreach (var handle in held) handle.Dispose();
        }
    }

    private static string Hash(Stream file)
    {
        using (var sha = SHA256.Create())
            return BitConverter.ToString(sha.ComputeHash(file)).Replace("-", "").ToLowerInvariant();
    }

    private static bool MatchFile(string path, string expected)
    {
        bool matches = false;
        WithAncestors(path, () => {
            using (var handle = Open(path, 0x80000000, 1)) {
                if (handle == null || (Attributes(handle, path) & DirectoryFlag) != 0) return;
                using (var file = new FileStream(handle, FileAccess.Read))
                    matches = Same(Hash(file), expected);
            }
        });
        return matches;
    }

    private static Dictionary<string, string> Manifest(string version)
    {
        using (var source = Assembly.GetExecutingAssembly().GetManifestResourceStream(version))
        using (var reader = new StreamReader(source)) {
            var rows = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            for (var line = reader.ReadLine(); line != null; line = reader.ReadLine()) {
                var row = line.Split('\t');
                rows.Add(row[1].Replace('/', '\\'), row[0]);
            }
            return rows;
        }
    }

    private static string ReadValue(string key, string name)
    {
        using (var registry = Registry.CurrentUser.OpenSubKey(key))
            return registry == null ? null : registry.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string;
    }

    private static string Detect(string legacy)
    {
        var installedPath = ReadValue(InstallKey, "InstallLocation");
        var uninstall = ReadValue(UninstallKey, "UninstallString");
        var version = ReadValue(UninstallKey, "DisplayVersion");
        var expectedUninstall = "\"" + Path.Combine(legacy, "Uninstall Vaultor.exe") + "\" /currentuser";
        if ((installedPath != null && !Same(installedPath, legacy)) ||
            (uninstall != null && !Same(uninstall, expectedUninstall)))
            throw new IOException("Unsupported Vaultor installation registration. Existing data was retained.");

        foreach (var candidate in Versions) {
            if (version != null && !Same(candidate, version)) continue;
            var owned = Manifest(candidate);
            if (MatchFile(Path.Combine(legacy, "Vaultor.exe"), owned["Vaultor.exe"]) &&
                MatchFile(Path.Combine(legacy, @"resources\app\package.json"), owned[@"resources\app\package.json"]))
                return candidate;
        }
        if (version != null || installedPath != null || uninstall != null || Directory.Exists(legacy))
            throw new IOException("Vaultor's previous payload could not be verified. Existing data was retained.");
        return null;
    }

    private static void StopLegacy(string legacy, Dictionary<string, string> owned)
    {
        var prefix = legacy + Path.DirectorySeparatorChar;
        foreach (var process in Process.GetProcessesByName("Vaultor").Concat(Process.GetProcessesByName("java")).Concat(Process.GetProcessesByName("javaw"))) {
            using (process) {
                try {
                    var image = new StringBuilder(32768);
                    int length = image.Capacity;
                    if (!QueryFullProcessImageName(process.Handle, 0, image, ref length)) continue;
                    var path = image.ToString();
                    if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) continue;
                    string digest;
                    if (!owned.TryGetValue(path.Substring(prefix.Length), out digest) || !MatchFile(path, digest))
                        throw new IOException("Unverified running process in the legacy installation: " + path);
                    if (process.CloseMainWindow() && process.WaitForExit(5000)) continue;
                    if (!process.HasExited) process.Kill();
                    if (!process.WaitForExit(5000)) throw new IOException("The verified legacy process is still running.");
                } catch (InvalidOperationException) {
                    // Process exited before its image or state could be queried.
                } catch (Win32Exception e) {
                    if (e.NativeErrorCode != 5) throw;
                    // Other users' processes cannot be opened. In-scope file
                    // locks still stop the later guarded delete.
                }
            }
        }
    }

    private static void DeleteFile(string path, string digest)
    {
        using (var handle = Open(path, 0x80010000, 1)) {
            if (handle == null) return;
            if ((Attributes(handle, path) & DirectoryFlag) != 0)
                throw new IOException("Unexpected directory retained: " + path);
            DeleteOpenFile(handle, path, digest);
        }
    }

    private static void DeleteOpenFile(SafeFileHandle handle, string path, string digest)
    {
        using (var file = new FileStream(handle, FileAccess.Read)) {
            if (digest != null && !Same(Hash(file), digest))
                throw new IOException("Modified file retained: " + path);
            byte deleting = 1;
            if (!SetFileInformationByHandle(handle, 4, ref deleting, 1))
                throw new IOException(path, new Win32Exception(Marshal.GetLastWin32Error()));
        }
    }

    private static void CleanTree(string path, string relative, Dictionary<string, string> owned, List<string> residual)
    {
        try {
            using (var folder = Open(path, 0x80010000, 3)) {
                if (folder == null) return;
                if ((Attributes(folder, path) & DirectoryFlag) == 0) {
                    string digest = null;
                    if (owned != null && !owned.TryGetValue(relative, out digest)) {
                        residual.Add("Unrecognized file retained: " + path);
                        return;
                    }
                    DeleteOpenFile(folder, path, digest);
                    return;
                }
                if (owned != null && relative.Length != 0 && !owned.Keys.Any(p => p.StartsWith(relative + "\\", StringComparison.OrdinalIgnoreCase))) {
                    residual.Add("Unrecognized directory retained: " + path);
                    return;
                }
                var before = residual.Count;
                foreach (var child in Directory.EnumerateFileSystemEntries(path).ToArray())
                    CleanTree(child, Path.Combine(relative, Path.GetFileName(child)), owned, residual);
                if (residual.Count == before && !Directory.EnumerateFileSystemEntries(path).Any()) {
                    byte deleting = 1;
                    if (!SetFileInformationByHandle(folder, 4, ref deleting, 1))
                        throw new IOException(path, new Win32Exception(Marshal.GetLastWin32Error()));
                }
            }
        } catch (IOException e) { residual.Add(e.Message); }
        catch (UnauthorizedAccessException e) { residual.Add(e.Message); }
    }

    private static void RemoveShortcut(string path, string target, List<string> residual)
    {
        try {
            WithAncestors(path, () => {
                string digest;
                using (var shortcutFile = Open(path, 0x80000000, 1)) {
                    if (shortcutFile == null) return;
                    Attributes(shortcutFile, path);
                    var shellType = Type.GetTypeFromProgID("WScript.Shell", true);
                    var shell = Activator.CreateInstance(shellType);
                    try {
                        var link = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { path });
                        try {
                            var value = link.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, link, null) as string;
                            if (!Same(value, target)) return;
                            using (var file = new FileStream(shortcutFile, FileAccess.Read))
                                digest = Hash(file);
                        } finally { Marshal.FinalReleaseComObject(link); }
                    } finally { Marshal.FinalReleaseComObject(shell); }
                }
                DeleteFile(path, digest);
            });
        } catch (Exception e) { residual.Add("Shortcut retained: " + path + " (" + e.Message + ")"); }
    }

    private static void FinalizeReplacement(string legacy, string roaming, string version, string receipt, StreamWriter log)
    {
        var residual = new List<string>();
        var profile = Path.Combine(roaming, "Vaultor");
        if (version != null) {
            var owned = Manifest(version);
            StopLegacy(legacy, owned);
            try {
                WithAncestors(Path.Combine(profile, "placeholder"), () => {
                    foreach (var item in ProfileEntries)
                        CleanTree(Path.Combine(profile, item), item, null, residual);
                    foreach (var path in Directory.EnumerateFileSystemEntries(profile)) {
                        if (!ProfileEntries.Contains(Path.GetFileName(path), StringComparer.OrdinalIgnoreCase))
                            residual.Add("Legacy profile entry retained: " + path);
                    }
                });
            } catch (IOException e) { residual.Add(e.Message); }
            catch (UnauthorizedAccessException e) { residual.Add(e.Message); }
            WithAncestors(legacy, () => CleanTree(legacy, "", owned, residual));
            var executable = Path.Combine(legacy, "Vaultor.exe");
            var removed = false;
            try { WithAncestors(legacy, () => {
                using (var exists = Open(executable, 0x80, 3)) removed = exists == null;
            }); } catch (IOException e) { residual.Add(e.Message); }
            if (removed) {
                RemoveShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Vaultor.lnk"), executable, residual);
                RemoveShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Vaultor.lnk"), executable, residual);
                try {
                    using (var key = Registry.CurrentUser.OpenSubKey(RunKey, true)) {
                        var command = key == null ? null : key.GetValue("Vaultor") as string;
                        if (key != null && (Same(command, "\"" + executable + "\" --background") ||
                            (!executable.Contains(" ") && Same(command, executable + " --background"))))
                            key.DeleteValue("Vaultor", false);
                    }
                    Registry.CurrentUser.DeleteSubKey(UninstallKey, false);
                    Registry.CurrentUser.DeleteSubKey(InstallKey, false);
                } catch (Exception e) { residual.Add("Legacy registration retained: " + e.Message); }
            }
        } else {
            try {
                WithAncestors(profile, () => {
                    using (var leftover = Open(profile, 0x80, 3)) {
                        if (leftover != null) residual.Add("Legacy profile without a verified installation retained: " + profile);
                    }
                });
            } catch (IOException e) { residual.Add(e.Message); }
            catch (UnauthorizedAccessException e) { residual.Add(e.Message); }
        }
        foreach (var message in residual.Count == 0 ? new[] { "Complete" } : residual.ToArray())
            log.WriteLine(message);
        log.Flush();
        if (residual.Count != 0)
            throw new IOException("Legacy residuals were retained. Details: " + receipt);
    }

    private static int Main(string[] args)
    {
        try {
            if (args.Length != 3 || (args[0] != "prepare" && args[0] != "finish")) return 1;
            var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var roaming = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            if (String.IsNullOrEmpty(local) || String.IsNullOrEmpty(roaming)) return 1;
            var legacy = Path.Combine(local, @"Programs\Vaultor");
            var next = Path.GetFullPath(args[1]).TrimEnd('\\');
            if (!Same(next, Path.Combine(local, "Vaultor Next")))
                throw new IOException("Use the default per-user Vaultor Next installation directory.");
            WithAncestors(Path.Combine(next, "vaultor-next.exe"), () => {});
            var receipt = Path.Combine(roaming, NextId, "electron-replacement.txt");
            bool handled = false;
            WithAncestors(receipt, () => {
                using (var existing = Open(receipt, 0x80, 3)) {
                    if (existing == null) return;
                    Attributes(existing, receipt);
                    handled = true;
                }
            });
            if (handled) return 0;
            var version = Detect(legacy);
            if (args[0] == "prepare") {
                if (version != null) StopLegacy(legacy, Manifest(version));
                return 0;
            }

            var installed = Path.Combine(next, "vaultor-next.exe");
            var confirmed = false;
            WithAncestors(installed, () => {
                using (var file = Open(installed, 0x80000000, 1)) {
                    if (file == null || (Attributes(file, installed) & DirectoryFlag) != 0) return;
                    var info = FileVersionInfo.GetVersionInfo(installed);
                    if (info.ProductName != "Vaultor Next" || info.ProductVersion != args[2]) return;
                    confirmed = true;
                    WithAncestors(Path.GetDirectoryName(receipt), () => Directory.CreateDirectory(Path.GetDirectoryName(receipt)));
                    WithAncestors(receipt, () => {
                        // Take the one-time slot before applying cleanup. A later update
                        // cannot retry a partial reset against subsequently-created data.
                        using (var logFile = new FileStream(receipt, FileMode.CreateNew, FileAccess.Write, FileShare.Read))
                        using (var writer = new StreamWriter(logFile)) {
                            writer.WriteLine(version == null ? "Fresh Vaultor Next installation" : "Verified Electron " + version);
                            writer.Flush();
                            logFile.Flush(true);
                            FinalizeReplacement(legacy, roaming, version, receipt, writer);
                        }
                    });
                }
            });
            if (!confirmed) throw new IOException("Could not verify the installed Vaultor Next payload.");
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error.Message);
            return 2;
        }
    }
}
