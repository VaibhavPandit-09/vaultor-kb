// Snapshot measures remain distinct from the untouched-window CPU percentage.
export function roleSamples(snapshot){
 const result=[];
 for(const [role,processes]of Object.entries(Object.groupBy(snapshot.processes,p=>p.role))){
  for(const [field,unit,divisor]of [['workingSet','MiB',1048576],['privateBytes','MiB',1048576],['privateWorkingSet','MiB',1048576],['cpuSeconds','s',1]]){
   if(!processes.every(p=>Number.isFinite(p[field])))continue;
   result.push({scenario:'settled-idle-roles-m9',iteration:1,metric:role+'_'+field,value:processes.reduce((sum,p)=>sum+p[field],0)/divisor,unit,notes:'Recorded CIM role snapshot after the idle window; CPU is cumulative since process launch,not window utilization.',valid:true});
  }
 }
 return result;
}
