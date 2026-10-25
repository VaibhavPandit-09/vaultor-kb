package vaultor.linked;

/** Owner-local production child. Only the Electron main process owns these
 * inherited pipes, root-consent key and independent validator signing key. */
public final class LinkedHost {
    public static void main(String[] args)throws Exception {PrivateHost.run(true);}
}
