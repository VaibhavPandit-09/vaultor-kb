export type Criteria={query:string;content:boolean;order:'created'|'updated'|'title'};
export const defaultCriteria:Criteria={query:'',content:false,order:'created'};
export const isFiltered=(c:Criteria)=>!!c.query.trim()||c.order!=='created';
