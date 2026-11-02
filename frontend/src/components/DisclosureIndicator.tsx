/** The same compact mark compresses from plus to minus when a section opens. */
export default function DisclosureIndicator({expanded}:{expanded:boolean}){
 return <span className="disclosure-indicator" data-expanded={expanded} aria-hidden="true"/>;
}
