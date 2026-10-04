package com.vaultor.vaultor.host;

/** Messages are deliberately fixed: never include submitted secrets or codes. */
public class AccessFailure extends RuntimeException {
    public final int status;
    public final String code;
    public AccessFailure(int status, String code, String detail) { super(detail); this.status=status; this.code=code; }
}
