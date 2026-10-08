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
    // Disconnected SSE/download clients have no writable response; do not turn them into JSON 500s.
    @ExceptionHandler(org.springframework.web.context.request.async.AsyncRequestNotUsableException.class)
    public void disconnected(org.springframework.web.context.request.async.AsyncRequestNotUsableException ignored) {}
    public static class RevisionConflict extends RuntimeException { public RevisionConflict() { super("This note changed elsewhere. Keep your draft and resolve the conflict before saving."); } }
    public static class FieldError extends IllegalArgumentException {
        public final String field;
        public FieldError(String field, String detail) { super(detail); this.field=field; }
    }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> handle(Exception e) {
        boolean revisionConflict = e instanceof RevisionConflict || e instanceof org.springframework.dao.OptimisticLockingFailureException || e instanceof jakarta.persistence.OptimisticLockException;
        int status = e instanceof com.vaultor.vaultor.host.AccessFailure a ? a.status : revisionConflict ? 412 : e instanceof ResponseStatusException r ? r.getStatusCode().value()
            : e instanceof NoSuchElementException || e instanceof org.springframework.web.servlet.resource.NoResourceFoundException ? 404
            : e instanceof MaxUploadSizeExceededException ? 413
            : e instanceof IllegalArgumentException || e instanceof HttpMessageNotReadableException || e instanceof MethodArgumentTypeMismatchException || e instanceof org.springframework.web.bind.MissingRequestHeaderException ? 400 : 500;
        String code = switch(status) { case 428 -> "NOTE_REVISION_REQUIRED"; case 429 -> "RATE_LIMITED"; case 412 -> "NOTE_REVISION_CONFLICT"; case 400 -> "INVALID_REQUEST"; case 404 -> "NOT_FOUND"; case 405 -> "ACTION_RETIRED"; case 410 -> "RESOURCE_TRASHED"; case 426 -> "CLIENT_UPDATE_REQUIRED"; case 409 -> "CONFLICT"; case 413 -> "UPLOAD_TOO_LARGE"; default -> "INTERNAL_ERROR"; };
        if(e instanceof com.vaultor.vaultor.host.AccessFailure a) code=a.code;
        String detail = status == 500 ? "Unexpected server error. Use the request ID to find details in logs."
            : revisionConflict ? "This note changed elsewhere. Keep your draft and resolve the conflict before saving."
            : e instanceof HttpMessageNotReadableException ? "Malformed JSON request body"
            : e instanceof ResponseStatusException r ? r.getReason() : e.getMessage();
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(status), detail == null ? code : detail);
        problem.setProperty("code", code); problem.setProperty("requestId", MDC.get("requestId")); problem.setProperty("fieldErrors", e instanceof FieldError f ? Map.of(f.field, List.of(f.getMessage())) : Map.of());
        if (status >= 500) log.error("request failed code={}", code, e); else log.warn("request rejected code={} detail={}", code, detail);
        return ResponseEntity.status(status).body(problem);
    }
}
