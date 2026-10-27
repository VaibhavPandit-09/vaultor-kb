package vaultor.linked;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Uses the existing native-test assertions; never starts an app or a source host. */
public final class PrivateHostFrameTests extends SafetyTests {
    static final int LIMIT=16*1024*1024;
    static InputStream repeated(int length,boolean newline){return new InputStream(){
        int remaining=length;boolean ended=!newline;
        public int read(){if(remaining>0){remaining--;return 'x';}if(!ended){ended=true;return '\n';}return -1;}
        public int read(byte[] b,int off,int len){if(remaining==0){int next=read();if(next<0)return -1;b[off]=(byte)next;return 1;}int n=Math.min(len,remaining);Arrays.fill(b,off,off+n,(byte)'x');remaining-=n;return n;}
    };}
    public static void main(String[] args){
        check("empty frames, coalesced frames and unterminated final frame preserve boundaries",()->{
            var reader=new PrivateHost.FrameReader(new ByteArrayInputStream("\nfirst\nsecond\nlast".getBytes(StandardCharsets.UTF_8)));
            require(reader.line().equals(""));require(reader.line().equals("first"));require(reader.line().equals("second"));require(reader.line().equals("last"));require(reader.line()==null);
        });
        check("fragmented input preserves UTF8 bytes across buffer boundaries",()->{
            String value="x".repeat(65535)+"😀\tBOM \ufeff tail";
            for(int chunk:new int[]{1,3,65536}){
                var input=new ByteArrayInputStream((value+"\nnext\n").getBytes(StandardCharsets.UTF_8)){
                    public synchronized int read(byte[] b,int off,int len){return super.read(b,off,Math.min(chunk,len));}
                };
                var reader=new PrivateHost.FrameReader(input);require(reader.line().equals(value));require(reader.line().equals("next"));require(reader.line()==null);
            }
        });
        check("exact sixteen MiB byte bound is accepted with newline or EOF",()->{
            for(boolean newline:new boolean[]{true,false}){var reader=new PrivateHost.FrameReader(repeated(LIMIT,newline));require(reader.line().length()==LIMIT);require(reader.line()==null);}
        });
        check("oversized frames refuse rather than truncating or accepting a prefix",()->{
            for(boolean newline:new boolean[]{true,false})rejects("FRAME_LIMIT",()->new PrivateHost.FrameReader(repeated(LIMIT+1,newline)).line());
        });
        check("ordinary large frames use bulk reads without per-byte input calls",()->{
            int[] calls={0,0};var input=new FilterInputStream(repeated(3*1024*1024,true)){
                public int read()throws IOException{calls[0]++;return in.read();}
                public int read(byte[] b,int off,int len)throws IOException{calls[1]++;return in.read(b,off,len);}
            };
            var reader=new PrivateHost.FrameReader(input);require(reader.line().length()==3*1024*1024);require(calls[0]==0&&calls[1]<=50);
        });
        check("a zero-length bulk read falls back safely and input failures propagate",()->{
            var input=new ByteArrayInputStream("kept\n".getBytes(StandardCharsets.UTF_8)){
                boolean zero=true;public synchronized int read(byte[] b,int off,int len){if(zero){zero=false;return 0;}return super.read(b,off,len);}
            };
            require(new PrivateHost.FrameReader(input).line().equals("kept"));
            rejects("TEST_INPUT_FAILURE",()->new PrivateHost.FrameReader(new InputStream(){public int read()throws IOException{throw new IOException("TEST_INPUT_FAILURE");}}).line());
        });
        System.out.println("TOTAL "+passed+" passed; "+failed+" failed");if(failed>0)System.exit(1);
    }
}
