FROM eclipse-temurin:25-jdk-alpine AS builder

WORKDIR /app

# Copy maven wrapper and pom.xml
COPY mvnw .
COPY .mvn .mvn
COPY pom.xml .

# Make wrapper executable
RUN chmod +x ./mvnw

# Resolve dependencies
RUN ./mvnw dependency:go-offline -B

# Copy source code and build
COPY src src
RUN ./mvnw package -DskipTests

# Stage 2: Runtime
FROM eclipse-temurin:25-jre-alpine

WORKDIR /app

# Ensure /data exists (the volume mount point)
RUN mkdir -p /data/files
VOLUME /data

# Define ENV vars that reference the volume
ENV DB_PATH=/data/app.db
ENV STORAGE_PATH=/data/files

# Copy JAR from builder
COPY --from=builder /app/target/vaultor-0.0.1-SNAPSHOT.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
