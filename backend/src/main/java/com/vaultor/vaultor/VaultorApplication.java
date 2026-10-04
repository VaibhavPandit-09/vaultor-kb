package com.vaultor.vaultor;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class VaultorApplication {

	public static void main(String[] args) {
		if(com.vaultor.vaultor.host.OwnerBootstrap.run(args)) return;
		var owner = com.vaultor.vaultor.config.DesktopOwner.acquire(System.getenv());
		try {
			var context = SpringApplication.run(VaultorApplication.class, args);
			if (owner != null) owner.ready(context);
		} catch (Throwable failure) {
			if (owner != null) owner.close();
			throw failure;
		}
	}

}
