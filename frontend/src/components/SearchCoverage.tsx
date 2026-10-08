import type {FileCoverage} from '../lib/resourceSearch';
export default function SearchCoverage({coverage,onRefresh}:{coverage?:FileCoverage;onRefresh?:()=>void}){
 if(!coverage)return <p className="text-xs text-[var(--text-secondary)]" role="status">File-content coverage unavailable. Update the connected host to 0.7.0; results may only include file titles.</p>;
 const pending=coverage.queued+coverage.indexing,limited=coverage.limitExceeded+coverage.encrypted+coverage.invalid+coverage.failed;
 return <p className="text-xs text-[var(--text-secondary)]" role="status">Saved files: {coverage.indexed} searchable{pending>0&&` · ${pending} pending`}{coverage.unsupported>0&&` · ${coverage.unsupported} unsupported`}{coverage.noText>0&&` · ${coverage.noText} without extractable text (no OCR)`}{limited>0&&` · ${limited} unavailable; inspect or retry in Diagnostics`}{coverage.failure&&` · ${coverage.failure}`}{pending>0&&onRefresh&&<button className="ml-2 text-primary underline" onClick={onRefresh}>Refresh results</button>}</p>;
}
