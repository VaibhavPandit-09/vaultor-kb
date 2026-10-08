module.exports = {
  appId: 'personal.vaultor.desktop', productName: 'Vaultor', executableName: 'Vaultor',
  asar: false, forceCodeSigning: false, publish: null,
  directories: { output: 'releases', buildResources: 'assets' },
  files: ['src/**', 'ui/**', 'assets/**', 'release-trust.json', 'package.json','scripts/native-owned-smoke.mjs','scripts/native-chrome-smoke.mjs','scripts/native-pointer.ps1','scripts/native-layout-smoke.mjs','scripts/native-oled-smoke.mjs','scripts/native-settings-smoke.mjs','scripts/native-images-smoke.mjs','scripts/native-motion-smoke.mjs'],
  extraResources: [{ from: process.env.VAULTOR_BUILD_BUNDLE || 'bundle', to: 'bundle' }],
  win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'assets/vaultor.ico', signExecutable: false, signAndEditExecutable: true },
  nsis: { oneClick: false, perMachine: false, allowElevation: false, allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false, runAfterFinish: true, shortcutName: 'Vaultor',
    installerIcon: 'assets/vaultor.ico', uninstallerIcon: 'assets/vaultor.ico', artifactName: 'Vaultor-${version}-windows-x64.exe' },
  mac: { target: [{ target: 'dmg', arch: ['arm64'] }], icon: 'assets/vaultor.icns',
    identity: '-', hardenedRuntime: false, notarize: false, artifactName: 'Vaultor-${version}-mac-arm64.dmg' },
  dmg: { sign: false },
};
