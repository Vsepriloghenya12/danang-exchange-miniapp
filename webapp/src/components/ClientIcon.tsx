import React from "react";
export type ClientIconName = "chat" | "help" | "info" | "shield" | "document" | "code" | "plane" | "hotel" | "visa" | "chevron" | "receipt";
const paths: Record<ClientIconName, React.ReactNode> = {
 chat:<><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a9 9 0 0 1 18 0Z"/><path d="M7 10h8M7 14h5"/></>,
 help:<><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01"/></>,
 info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
 shield:<><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>,
 document:<><path d="M14 3H5v18h14V8l-5-5Z"/><path d="M14 3v5h5M8 12h8M8 16h6"/></>,
 code:<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>,
 plane:<path d="m21 3-6 18-4-8-8-4 18-6Zm0 0L11 13"/>,
 hotel:<><path d="M3 20V9h18v11M3 16h18M6 9V4h12v5M7 12h3m4 0h3"/></>,
 visa:<><rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17h8M12 7v6M9 10h6"/></>,
 chevron:<path d="m9 5 7 7-7 7"/>,
 receipt:<><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/></>,
};
export default function ClientIcon({name,className=""}:{name:ClientIconName;className?:string}) {
 return <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
