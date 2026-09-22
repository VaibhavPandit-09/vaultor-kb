package com.vaultor.vaultor;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.nio.file.Files;
import java.nio.file.Path;

@SpringBootTest
class VaultorApplicationTests {
    static final Path DATA;
    static { try { DATA = Files.createTempDirectory("vaultor-context-test-"); } catch(Exception e) { throw new ExceptionInInitializerError(e); } }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", () -> "jdbc:sqlite:" + DATA.resolve("app.db"));
        properties.add("app.storage.path", () -> DATA.resolve("files").toString());
    }

	@Test
	void contextLoads() {
	}

}
