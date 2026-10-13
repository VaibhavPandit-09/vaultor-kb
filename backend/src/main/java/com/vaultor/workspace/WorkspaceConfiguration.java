package com.vaultor.workspace;

import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.persistence.autoconfigure.EntityScan;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

/** Independent domain context: no listener, host secrets, filters, or mutable routing datasource. */
@Configuration(proxyBeanMethods=false)
@EnableAutoConfiguration
@EnableWebMvc
@Import(com.vaultor.vaultor.config.RequestEntityManager.class)
@EntityScan("com.vaultor.vaultor.model")
@EnableJpaRepositories("com.vaultor.vaultor.repository")
@ComponentScan(basePackages={"com.vaultor.vaultor.service","com.vaultor.vaultor.controller"})
public class WorkspaceConfiguration {}
