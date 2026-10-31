const stages=new Set(['read_input','input_validation','runtime_identity','proof_server','application_signing','channel_request','response_validation','result_delivery']);
const codes=new Set(['invalid_channel_input','channel_unauthorized','channel_unavailable','unavailable','invalid_books_input','sanctions_unavailable','infura_configuration_required','rpc_transport','rpc_unavailable','rpc_invalid_response','invalid_rpc_quantity','invalid_block','wrong_chain','stale_chain','lookup_limit_narrow_range','historical_balance_unavailable','range_before_usdc_history','range_not_yet_observed','chain_reorganized','invalid_transfer_log','invalid_range_logs','inconsistent_logs','balance_reconciliation_failed','transaction_not_found_or_pending','transaction_not_successful','usdc_transfer_not_found','ambiguous_transfer_use_tx_hash_and_log_index']);
export function failureLine(value){
 const stage=stages.has(value.stage)?value.stage:'unknown';
 const channel=['application_proof','product_lookup'].includes(value.channel_stage)?value.channel_stage:'unknown';
 const code=codes.has(value.code)?value.code:'unavailable';
 const status=Number.isInteger(value.http_status)&&value.http_status>=400&&value.http_status<=599?value.http_status:'unknown';
 return `Result not completed. stage=${stage}; channel_stage=${channel}; code=${code}; http_status=${status}. No automatic retry; inspect the saved run before starting again.`;
}
