package com.vaultor.vaultor.config;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.orm.jpa.support.OpenEntityManagerInViewInterceptor;
import org.springframework.web.servlet.config.annotation.*;
/** Lazy resource DTO associations still need a request context, but streams must release SQLite. */
@Configuration
public class RequestEntityManager implements WebMvcConfigurer {
    private final EntityManagerFactory factory;
    public RequestEntityManager(EntityManagerFactory factory){this.factory=factory;}
    @Override public void addInterceptors(InterceptorRegistry registry) {
        var interceptor=new OpenEntityManagerInViewInterceptor();interceptor.setEntityManagerFactory(factory);
        registry.addWebRequestInterceptor(interceptor).excludePathPatterns("/api/changes");
    }
}
