# Stage 1: Build the frontend (React/Vite)
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build the backend (Spring Boot)
FROM eclipse-temurin:25-jdk-alpine AS backend-builder
WORKDIR /app
COPY backend/mvnw .
COPY backend/.mvn .mvn
COPY backend/pom.xml .
RUN chmod +x ./mvnw
RUN ./mvnw dependency:go-offline -B

COPY backend/src src
# Copy frontend build output natively to spring boot's resources static folder
COPY --from=frontend-builder /app/frontend/dist src/main/resources/static
RUN ./mvnw package -DskipTests

# Stage 3: Runtime
FROM eclipse-temurin:25-jre-alpine
WORKDIR /app

# Ensure /data exists
RUN mkdir -p /data/files
VOLUME /data

# Envrionment paths
ENV DB_PATH=/data/app.db
ENV STORAGE_PATH=/data/files

COPY --from=backend-builder /app/target/vaultor-0.0.1-SNAPSHOT.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
