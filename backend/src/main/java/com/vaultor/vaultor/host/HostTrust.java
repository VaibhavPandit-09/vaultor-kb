package com.vaultor.vaultor.host;

import java.nio.file.*;
import java.security.*;
import java.security.cert.X509Certificate;
import java.time.*;
import java.util.*;
import java.math.BigInteger;
import java.net.*;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.*;
import org.bouncycastle.cert.jcajce.*;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;

/** Stable per-host CA; replaceable leaf, with JSSE validating the certificate chain. */
public final class HostTrust {
    final Path directory;
    final char[] password;
    final KeyStore store;
    public HostTrust(Path directory, String hostId) throws Exception {
        this.directory=directory;
        Path passwordFile=directory.resolve("trust.password"), storeFile=directory.resolve("trust.p12");
        boolean passwordExists=Files.exists(passwordFile), storeExists=Files.exists(storeFile);
        if(passwordExists!=storeExists) throw new IllegalStateException("Host trust is incomplete. Restore the host-access backup; trust was not reset.");
        store=KeyStore.getInstance("PKCS12");
        if(storeExists) {
            password=Files.readString(passwordFile).toCharArray();
            try(var in=Files.newInputStream(storeFile)){store.load(in,password);}
            ca().checkValidity(); // An expired CA requires explicit host trust recovery, never silent rotation.
        } else {
            password=HostAccess.secret().toCharArray(); store.load(null,password);
            KeyPair keys=keyPair(); var name=new X500Name("CN=Vaultor Host "+hostId);
            var builder=builder(name,name,keys.getPublic(),3650);
            builder.addExtension(Extension.basicConstraints,true,new BasicConstraints(0));
            builder.addExtension(Extension.keyUsage,true,new KeyUsage(KeyUsage.keyCertSign|KeyUsage.cRLSign));
            X509Certificate ca=certificate(builder,keys.getPrivate());
            store.setKeyEntry("ca",keys.getPrivate(),password,new java.security.cert.Certificate[]{ca});
            // An interrupted initial provisioning fails closed on next boot and keeps recoverable material.
            HostFiles.write(passwordFile,new String(password).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            save();
        }
        renew(false);
    }
    static KeyPair keyPair() throws Exception {var generator=KeyPairGenerator.getInstance("RSA");generator.initialize(3072);return generator.generateKeyPair();}
    static JcaX509v3CertificateBuilder builder(X500Name issuer,X500Name subject,PublicKey key,int days){
        return new JcaX509v3CertificateBuilder(issuer,new BigInteger(159,new SecureRandom()),Date.from(Instant.now().minusSeconds(300)),Date.from(Instant.now().plusSeconds(days*86400L)),subject,key);
    }
    static X509Certificate certificate(JcaX509v3CertificateBuilder builder,PrivateKey signer) throws Exception {
        return new JcaX509CertificateConverter().getCertificate(builder.build(new JcaContentSignerBuilder("SHA256withRSA").build(signer)));
    }
    public X509Certificate ca() throws Exception {return (X509Certificate)store.getCertificate("ca");}
    public String fingerprint() throws Exception {return HostAccess.hash(ca().getEncoded());}
    public byte[] publicCertificate() throws Exception {
        return ("-----BEGIN CERTIFICATE-----\n"+Base64.getMimeEncoder(64,new byte[]{10}).encodeToString(ca().getEncoded())+"\n-----END CERTIFICATE-----\n").getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    }
    public synchronized boolean renew(boolean force) throws Exception {
        var addresses=new TreeSet<String>();addresses.add("localhost");addresses.add("127.0.0.1");addresses.add("::1");
        for(var network:Collections.list(NetworkInterface.getNetworkInterfaces())) if(network.isUp())
            for(var address:Collections.list(network.getInetAddresses())) if(HostAccess.privateAddress(address)) addresses.add(address.getHostAddress().split("%")[0]);
        var existing=(X509Certificate)store.getCertificate("server");
        if(!force && existing!=null && existing.getNotAfter().toInstant().isAfter(Instant.now().plusSeconds(30*86400L))) {
            var sans=existing.getSubjectAlternativeNames(); var present=new HashSet<String>();
            if(sans!=null) for(var san:sans) present.add(String.valueOf(san.get(1)));
            if(present.containsAll(addresses)) return false;
        }
        KeyPair leaf=keyPair(); var ca=ca(); ca.checkValidity();
        var builder=builder(new X500Name(ca.getSubjectX500Principal().getName()),new X500Name("CN=Vaultor"),leaf.getPublic(),365);
        var names=addresses.stream().map(a->new GeneralName(a.equals("localhost")?GeneralName.dNSName:GeneralName.iPAddress,a)).toArray(GeneralName[]::new);
        builder.addExtension(Extension.subjectAlternativeName,false,new GeneralNames(names));
        builder.addExtension(Extension.basicConstraints,true,new BasicConstraints(false));
        builder.addExtension(Extension.keyUsage,true,new KeyUsage(KeyUsage.digitalSignature|KeyUsage.keyEncipherment));
        builder.addExtension(Extension.extendedKeyUsage,false,new ExtendedKeyUsage(KeyPurposeId.id_kp_serverAuth));
        X509Certificate cert=certificate(builder,(PrivateKey)store.getKey("ca",password));cert.verify(ca.getPublicKey());
        store.setKeyEntry("server",leaf.getPrivate(),password,new java.security.cert.Certificate[]{cert,ca});save();return true;
    }
    void save() throws Exception {var out=new java.io.ByteArrayOutputStream();store.store(out,password);HostFiles.write(directory.resolve("trust.p12"),out.toByteArray());}
}
