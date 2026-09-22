package com.vaultor.vaultor.controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.slf4j.MDC;
import lombok.extern.slf4j.Slf4j;
import java.util.*;

@RestControllerAdvice @Slf4j
public class ApiErrors {
    public static class FieldError extends IllegalArgumentException {
        public final String field;
        public FieldError(String field, String detail) { super(detail); this.field=field; }
    }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handle(Exception e) {
        int status = e instanceof ResponseStatusException r ? r.getStatusCode().value()
            : e instanceof NoSuchElementException || e instanceof org.springframework.web.servlet.resource.NoResourceFoundException ? 404
            : e instanceof MaxUploadSizeExceededException ? 413
            : e instanceof IllegalArgumentException || e instanceof HttpMessageNotReadableException || e instanceof MethodArgumentTypeMismatchException ? 400 : 500;
        String code = switch(status) { case 400 -> "INVALID_REQUEST"; case 404 -> "NOT_FOUND"; case 409 -> "CONFLICT"; case 413 -> "UPLOAD_TOO_LARGE"; default -> "INTERNAL_ERROR"; };
        String detail = status == 500 ? "Unexpected server error. Use the request ID to find details in logs."
            : e instanceof HttpMessageNotReadableException ? "Malformed JSON request body"
            : e instanceof ResponseStatusException r ? r.getReason() : e.getMessage();
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(status), detail == null ? code : detail);
        problem.setProperty("code", code); problem.setProperty("requestId", MDC.get("requestId")); problem.setProperty("fieldErrors", e instanceof FieldError f ? Map.of(f.field, List.of(f.getMessage())) : Map.of());
        if (status >= 500) log.error("request failed code={}", code, e); else log.warn("request rejected code={} detail={}", code, detail);
        return ResponseEntity.status(status).body(problem);
    }
}
