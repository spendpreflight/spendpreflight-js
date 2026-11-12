// Books-only lookup outcomes. Authentication, configuration and integrity errors
// still fail the run; an unavailable lookup never becomes a verified result.
export const BOOKS_LOOKUP_TIMEOUT_MS=45000;
const operations=new Set(['receipt','statement']);
const emptyCodes=new Set(['transaction_not_found_or_pending','usdc_transfer_not_found']);
const unavailableCodes=new Set(['rpc_transport','rpc_unavailable','historical_balance_unavailable','lookup_limit_narrow_range']);

class BooksLookupOutcome extends Error{
 constructor(operation,status,reason){
  super('Books lookup did not produce a completed result');
  this.operation=operation;this.status=status;this.reason=reason;
 }
}

export async function requestBooks(envelope,operation,diagnostic,{fetcher=fetch,timeoutMs=BOOKS_LOOKUP_TIMEOUT_MS}={}){
 if(!operations.has(operation))throw Error('Books operation required');
 const controller=new AbortController();let timer;
 const deadline=new Promise((_,reject)=>{
  timer=setTimeout(()=>{
   reject(new BooksLookupOutcome(operation,'unavailable','lookup_deadline_exceeded'));
   controller.abort();
  },timeoutMs);
 });
 try{
  return await Promise.race([deadline,(async()=>{
   let response;
   try{
    response=await fetcher('https://api.spendpreflight.com/channels/apify/'+operation,{
     method:'POST',redirect:'error',signal:controller.signal,
     headers:{'Content-Type':'application/json'},body:JSON.stringify(envelope)
    });
   }catch{
    throw new BooksLookupOutcome(operation,'unavailable','channel_transport_unavailable');
   }
   if(!response.ok){
    const failure=await response.json().catch(()=>({}));
    diagnostic.http_status=response.status;
    diagnostic.channel_stage=failure.failure_stage;
    diagnostic.code=failure.failure_code;
    if(failure.failure_stage==='product_lookup'){
     if(operation==='receipt'&&(response.status===404||response.status===503)&&emptyCodes.has(failure.failure_code)){
      throw new BooksLookupOutcome(operation,'no_results',failure.failure_code);
     }
     if(response.status===503&&unavailableCodes.has(failure.failure_code)){
      throw new BooksLookupOutcome(operation,'unavailable',failure.failure_code);
     }
    }
    throw Error('Product unavailable; no completed-result event charged');
   }
   diagnostic.stage='response_validation';
   return await response.json();
  })()]);
 }finally{clearTimeout(timer);}
}

export function booksOutcomeItem(error,operation){
 if(!(error instanceof BooksLookupOutcome)||error.operation!==operation)return null;
 const missing=error.status==='no_results';
 return {
  operation,status:error.status,reason:error.reason,result:null,
  complete:false,verified:false,completed_result_event_charged:false,
  message:missing
   ?'No matching completed native USDC transfer was returned. A transaction may be missing or pending. No receipt was verified and no completed-result event was charged.'
   :'The lookup was unavailable or exceeded its deadline. Activity is unknown; this is not an empty-history determination. No completed-result event was charged.',
  ...(operation==='statement'?{reconciled:false,rows:[],coverage:{status:'unknown'}}:{})
 };
}

export async function deliverBooksOutcome(error,operation,actor){
 const item=booksOutcomeItem(error,operation);
 if(!item)return false;
 // Deliberately bypass completed-result billing and HTML/CSV exports.
 // A failed dataset write propagates; output/billing failures are never retried.
 await actor.pushData(item);
 return true;
}
