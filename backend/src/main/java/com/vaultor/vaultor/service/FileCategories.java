package com.vaultor.vaultor.service;

import java.util.*;

/** Shared SQL classification of stored MIME metadata. Never infer opening behavior from a suffix. */
public final class FileCategories {
    private FileCategories() {}
    public static final Set<String> VALUES=Set.of("image","pdf","audio","video","text","other");
    public static String expression(String alias) {
        if(!alias.matches("[a-z]+"))throw new IllegalArgumentException("Invalid SQL alias");
        String mime="lower(coalesce("+alias+".mime_type,''))";
        return "case when "+alias+".type<>'file' then null when "+mime+" like 'image/%' then 'image' when "+mime+"='application/pdf' then 'pdf' when "+mime+" like 'audio/%' then 'audio' when "+mime+" like 'video/%' then 'video' when "+mime+" like 'text/%' or "+mime+" in ('application/json','application/xml','application/javascript') then 'text' else 'other' end";
    }
    public static void filter(StringBuilder where,List<Object> args,String alias,String category) {
        if(category==null||category.isBlank()||category.equals("all"))return;
        if(!VALUES.contains(category))throw new IllegalArgumentException("Unknown file category");
        where.append(" and ("+expression(alias)+")=?");args.add(category);
    }
}
