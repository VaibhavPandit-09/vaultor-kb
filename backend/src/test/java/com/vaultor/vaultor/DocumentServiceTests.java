package com.vaultor.vaultor;

import com.vaultor.vaultor.service.DocumentService;
import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class DocumentServiceTests {
    final ObjectMapper json = new ObjectMapper();
    final DocumentService documents = new DocumentService(json);
    @Test void acceptsNotionListAttributesWithoutTreatingThemAsNodes() {
        var doc = json.readTree("""
          {"type":"doc","content":[
            {"type":"orderedList","attrs":{"start":1,"type":null},"content":[
              {"type":"listItem","content":[{"type":"paragraph","content":[
                {"type":"text","text":"Worker-Sharing Formula","marks":[{"type":"bold"}]}]}]}]},
            {"type":"codeBlock","attrs":{"language":null},"content":[{"type":"text","text":"R × demand / total"}]},
            {"type":"table","content":[{"type":"tableRow","content":[{"type":"tableCell","attrs":{"colspan":1,"rowspan":1,"colwidth":null},"content":[{"type":"paragraph","content":[{"type":"text","text":"0.667"}]}]}]}]}
          ]}
          """);
        assertDoesNotThrow(() -> documents.validate(doc));
        assertEquals(doc, documents.remap(doc, java.util.Map.of()));
    }
    @Test void stillRejectsMalformedNodesMarksAndExcessiveDepth() {
        for(String content : java.util.List.of(
            "{\"type\":\"doc\",\"content\":[{\"type\":null}]}",
            "{\"type\":\"doc\",\"content\":[1]}",
            "{\"type\":\"doc\",\"content\":[{\"type\":\"text\",\"text\":5}]}",
            "{\"type\":\"doc\",\"content\":[{\"type\":\"text\",\"marks\":[{\"type\":null}]}]}")) {
            assertThrows(IllegalArgumentException.class, () -> documents.validate(json.readTree(content)));
        }
        String deep = "{\"type\":\"paragraph\"}";
        for(int i=0;i<110;i++) deep="{\"type\":\"doc\",\"content\":["+deep+"]}";
        final var nested=json.readTree(deep);
        assertThrows(IllegalArgumentException.class, () -> documents.validate(nested));
    }
}
