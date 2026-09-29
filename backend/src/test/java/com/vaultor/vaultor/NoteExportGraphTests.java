package com.vaultor.vaultor;

import com.vaultor.vaultor.service.*;
import com.vaultor.vaultor.model.Resource;
import com.vaultor.vaultor.repository.ResourceRepository;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.nio.file.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class NoteExportGraphTests {
    @Test void enforcesEveryBoundAndIncludesTableAssetsWithoutFollowingBacklinks() throws Exception {
        var repository=mock(ResourceRepository.class);var files=mock(FileStorageService.class);
        var graph=new NoteExportGraph(repository,new DocumentService(new ObjectMapper()),files);
        for(var e:Map.of("maxNodes",10,"maxDepth",5).entrySet())ReflectionTestUtils.setField(graph,e.getKey(),e.getValue());
        for(String name:List.of("maxBytes","maxAssets","maxArchive"))ReflectionTestUtils.setField(graph,name,10000L);
        var a=new Resource();a.setId("a");a.setType("note");a.setTitle("Root");a.setContent(NoteExportServiceTests.links("b"));
        var b=new Resource();b.setId("b");b.setType("note");b.setTitle("Nested");b.setContent("{\"type\":\"doc\",\"content\":[{\"type\":\"table\",\"attrs\":{\"sourceResourceId\":\"file\"},\"content\":[]}]}");
        var f=new Resource();f.setId("file");f.setType("file");f.setTitle("source.csv");f.setFilePath("file");
        Path data=Files.createTempFile("export-graph-",".csv");Files.writeString(data,"a,b\n1,2");
        when(files.getFile("file")).thenReturn(data);
        when(repository.findById("a")).thenReturn(Optional.of(a));when(repository.findById("b")).thenReturn(Optional.of(b));when(repository.findById("file")).thenReturn(Optional.of(f));
        assertEquals(1,graph.collect("a",true).preview().files());assertEquals(List.of("a","b"),graph.collect("a",true).preview().noteIds());
        assertEquals(0,graph.collect("a",false).preview().files());
        ReflectionTestUtils.setField(graph,"maxNodes",2);assertThrows(IllegalArgumentException.class,()->graph.collect("a",true));ReflectionTestUtils.setField(graph,"maxNodes",10);
        ReflectionTestUtils.setField(graph,"maxDepth",1);assertThrows(IllegalArgumentException.class,()->graph.collect("a",true));ReflectionTestUtils.setField(graph,"maxDepth",5);
        ReflectionTestUtils.setField(graph,"maxBytes",1L);assertThrows(IllegalArgumentException.class,()->graph.collect("a",true));ReflectionTestUtils.setField(graph,"maxBytes",10000L);
        ReflectionTestUtils.setField(graph,"maxAssets",1L);assertThrows(IllegalArgumentException.class,()->graph.collect("a",true));ReflectionTestUtils.setField(graph,"maxAssets",10000L);
        Files.delete(data);assertTrue(graph.collect("a",true).preview().warnings().getFirst().contains("source.csv"));
        verify(repository,never()).findAll();
    }
}
