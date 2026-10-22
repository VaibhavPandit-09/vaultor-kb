package com.vaultor.vaultor.service;
import org.commonmark.node.*;
import org.commonmark.parser.Parser;
import com.vaultor.vaultor.host.AccessFailure;
import java.util.*;

/** AST-to-structured JSON only. Never render/import executable HTML or fetch assets. */
final class ImportMarkdown {
    private int nodes;private final LinkedHashSet<String> warnings=new LinkedHashSet<>();
    record Result(List<Map<String,Object>> blocks,List<String> warnings) {}
    static Result parse(String text){var converter=new ImportMarkdown();var root=Parser.builder().maxOpenBlockParsers(64).build().parse(text);var blocks=converter.children(root,0,List.of());if(blocks.isEmpty())blocks=List.of(Map.of("type","paragraph"));return new Result(blocks,List.copyOf(converter.warnings));}
    private List<Map<String,Object>> children(Node parent,int depth,List<Map<String,Object>> marks){
        if(depth>64)throw new AccessFailure(413,"IMPORT_CONVERSION_LIMIT","Markdown exceeds safe nesting depth");
        var out=new ArrayList<Map<String,Object>>();for(Node n=parent.getFirstChild();n!=null;n=n.getNext()){if(++nodes>20000)throw new AccessFailure(413,"IMPORT_CONVERSION_LIMIT","Markdown exceeds safe node count");out.addAll(node(n,depth+1,marks));}return out;
    }
    private Map<String,Object> text(String value,List<Map<String,Object>> marks){var result=new LinkedHashMap<String,Object>();result.put("type","text");result.put("text",value);if(!marks.isEmpty())result.put("marks",marks);return result;}
    private List<Map<String,Object>> node(Node node,int depth,List<Map<String,Object>> marks){
        if(node instanceof Text t)return t.getLiteral().isEmpty()?List.of():List.of(text(t.getLiteral(),marks));
        if(node instanceof SoftLineBreak)return List.of(text("\n",marks));
        if(node instanceof HardLineBreak)return List.of(Map.of("type","hardBreak"));
        if(node instanceof Code c){var m=new ArrayList<>(marks);m.add(Map.of("type","code"));return c.getLiteral().isEmpty()?List.of():List.of(text(c.getLiteral(),m));}
        if(node instanceof Emphasis||node instanceof StrongEmphasis){var m=new ArrayList<>(marks);m.add(Map.of("type",node instanceof StrongEmphasis?"bold":"italic"));return children(node,depth,m);}
        if(node instanceof Link link){String href=link.getDestination();if(href.matches("(?i)(?:https?://|mailto:|#).*")){var m=new ArrayList<>(marks);m.add(Map.of("type","link","attrs",Map.of("href",href)));return children(node,depth,m);}warnings.add("Local or unsupported links retained as text references");var out=children(node,depth,marks);out.add(text(" ("+href+")",marks));return out;}
        if(node instanceof Image image){warnings.add("Image references retained as text; external assets are not fetched");return List.of(text("[Image: "+plain(node)+"] ("+image.getDestination()+")",marks));}
        if(node instanceof HtmlInline h){warnings.add("Raw HTML retained as literal text");return List.of(text(h.getLiteral(),marks));}
        if(node instanceof HtmlBlock h){warnings.add("Raw HTML retained as literal text");return List.of(Map.of("type","paragraph","content",List.of(text(h.getLiteral(),List.of()))));}
        if(node instanceof ThematicBreak)return List.of(Map.of("type","horizontalRule"));
        if(node instanceof FencedCodeBlock f)return List.of(code(f.getLiteral(),f.getInfo()));
        if(node instanceof IndentedCodeBlock c)return List.of(code(c.getLiteral(),""));
        var block=new LinkedHashMap<String,Object>();String type=node instanceof Heading?"heading":node instanceof BlockQuote?"blockquote":node instanceof BulletList?"bulletList":node instanceof OrderedList?"orderedList":node instanceof ListItem?"listItem":"paragraph";block.put("type",type);
        if(node instanceof Heading h)block.put("attrs",Map.of("level",h.getLevel()));if(node instanceof OrderedList o)block.put("attrs",Map.of("start",o.getMarkerStartNumber()));
        var content=children(node,depth,marks);if(!content.isEmpty())block.put("content",content);return List.of(block);
    }
    private Map<String,Object> code(String literal,String info){var out=new LinkedHashMap<String,Object>();out.put("type","codeBlock");if(!info.isBlank())out.put("attrs",Map.of("language",info.strip().split("\\s+")[0].substring(0,Math.min(80,info.strip().split("\\s+")[0].length()))));if(!literal.isEmpty())out.put("content",List.of(text(literal,List.of())));return out;}
    private String plain(Node node){StringBuilder s=new StringBuilder();for(Node n=node.getFirstChild();n!=null;n=n.getNext()){if(n instanceof Text t)s.append(t.getLiteral());else if(n instanceof Code c)s.append(c.getLiteral());else s.append(plain(n));}return s.toString();}
}
