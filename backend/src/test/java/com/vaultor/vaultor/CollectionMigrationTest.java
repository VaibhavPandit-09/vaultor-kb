package com.vaultor.vaultor;
import com.vaultor.vaultor.service.OrganizationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest
class CollectionMigrationTest {
 static final Path DATA;static final String ID=UUID.randomUUID().toString();
 static {try{DATA=Files.createTempDirectory("vaultor-flat-upgrade-");try(var db=DriverManager.getConnection("jdbc:sqlite:"+DATA.resolve("app.db"));var sql=db.createStatement()){
  sql.execute("create table collections(id varchar(255) primary key,name varchar(255) not null,normalized_name varchar(255) not null unique,favorite boolean not null,creation_fingerprint varchar(255))");
  try(var insert=db.prepareStatement("insert into collections values(?,?,?,1,?)")){insert.setString(1,ID);insert.setString(2,"Existing");insert.setString(3,"existing");insert.setString(4,"retained");insert.executeUpdate();}
 }}catch(Exception e){throw new ExceptionInInitializerError(e);}}
 @DynamicPropertySource static void properties(DynamicPropertyRegistry p){p.add("spring.datasource.url",()->"jdbc:sqlite:"+DATA.resolve("app.db"));p.add("app.storage.path",()->DATA.resolve("files").toString());p.add("app.host.path",()->DATA.resolve("host").toString());}
 @Autowired OrganizationService org;
 @Test void upgradesAnExistingFlatSqliteTableWithoutRecreatingRows() throws Exception {
  var root=org.get(ID);assertEquals("Existing",root.name());assertTrue(root.favorite());assertNull(root.parentId());
  var child=org.createOnce(UUID.randomUUID().toString(),new OrganizationService.CreationInput("Existing",List.of(),ID));assertEquals(ID,child.parentId());
  try(var db=DriverManager.getConnection("jdbc:sqlite:"+DATA.resolve("app.db"));var statement=db.prepareStatement("select creation_fingerprint from collections where id=?")){statement.setString(1,ID);try(var rs=statement.executeQuery()){assertTrue(rs.next());assertEquals("retained",rs.getString(1));}}
 }
}
