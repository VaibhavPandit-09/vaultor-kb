import {Component,type ReactNode} from 'react';

export class PreviewBoundary extends Component<{source:string;children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<><p className="browse-feedback">Formatted preview is unavailable for this document. Its source remains intact.</p><pre className="whitespace-pre-wrap break-words font-mono text-sm">{this.props.source}</pre></>:this.props.children;}
}
