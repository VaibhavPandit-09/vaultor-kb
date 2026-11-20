export type Criteria={query:string;kind?:string;content:boolean;order:'created'|'updated'|'title'|'match';view?:string;tag?:string|null;tagName?:string;tags?:string[];anyTag?:boolean};
export const defaultCriteria:Criteria={query:'',content:false,order:'created'};
export const isFiltered=(c:Criteria)=>!!c.kind&&c.kind!=='all'||!!c.query.trim()||c.order!=='created'||!!c.view&&c.view!=='library'||!!c.tag||!!c.tags?.length;
