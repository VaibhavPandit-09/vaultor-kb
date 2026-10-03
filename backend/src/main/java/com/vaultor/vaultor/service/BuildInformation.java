package com.vaultor.vaultor.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class BuildInformation {
    public static final int API_PROTOCOL_VERSION = 1;
    public static final int MINIMUM_CLIENT_PROTOCOL_VERSION = 1;
    private final String version;
    public BuildInformation(@Value("${app.build.version:desktop-d1}") String version) { this.version = version; }
    public String version() { return version; }
}
