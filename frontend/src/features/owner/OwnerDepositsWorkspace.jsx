import React,{useState} from "react";
import RefundReview from "./RefundReview";
import MoveOutWorkflow from "../tenancies/MoveOutWorkflow";
import InvoiceReconciliation from "./InvoiceReconciliation";
import OwnerCheckoutReview from "./OwnerCheckoutReview";
import "./ProfessionalWorkbench.css";
export default function OwnerDepositsWorkspace(){
 const [tab,setTab]=useState("refunds");
 const tabs=[["refunds","Refund Requests"],["moveout","Move-out Records"],["invoices","Invoice Reconciliation"],["inspections","Checkout Inspections"]];
 return <div className="gn-workbench"><section className="gn-surface"><header className="gn-work-head"><div><h2>Deposits & Refunds</h2><p>Review deposit-related transactions and settle requests with clear audit context.</p></div></header><div className="gn-tab-buttons gn-work-tabs" role="tablist" aria-label="Deposit work areas">{tabs.map(([key,label])=><button key={key} role="tab" aria-selected={tab===key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}</button>)}</div>
 {tab==="refunds"&&<><RefundReview/><p className="gn-safe-note">Refund approval does not transfer money. Complete payment reconciliation before marking any refund as settled.</p></>}
 {tab==="moveout"&&<MoveOutWorkflow/>}
 {tab==="invoices"&&<InvoiceReconciliation/>}
 {tab==="inspections"&&<OwnerCheckoutReview/>}
 </section></div>
}
