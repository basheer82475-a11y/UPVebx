import { createClient } from '@supabase/supabase-js';
import './admin.css';

const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||import.meta.env.VITE_SUPABASE_ANON_KEY;
const db=url&&key?createClient(url,key,{auth:{storageKey:'upvebx-staff-auth'}}):null;
const $=selector=>document.querySelector(selector);
const responses=['Interested','Not Interested',"Didn't Attend / No Answer",'Busy','Switched Off','Number Invalid','Call Back Later','Follow-up Required','Already Has a Website','Asked to Send Demo','Demo Sent','Converted to Client'];
let records=[];
let history=[];
let staffId=null;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

if(!db){$('#staff-login-status').textContent='Supabase is not configured. Add the project URL and publishable key to .env.local.';$('#staff-login-form').hidden=true;}
else loadSession();

async function loadSession(){const {data:{session}}=await db.auth.getSession();if(session)await openDashboard(session.user);}
async function openDashboard(user){
  const {data:profile,error}=await db.from('staff_profiles').select('user_id,full_name,active').eq('user_id',user.id).maybeSingle();
  if(error||!profile?.active){await db.auth.signOut();$('#staff-login-status').textContent='This account is not an active staff account. Ask your administrator for access.';return;}
  staffId=user.id;$('#staff-name').textContent=profile.full_name;$('#staff-login-panel').hidden=true;$('#staff-dashboard').hidden=false;await loadBusinesses();
}

$('#staff-login-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;$('#staff-login-status').textContent='Signing in...';
  try{const values=Object.fromEntries(new FormData(form));const {data,error}=await db.auth.signInWithPassword({email:values.email,password:values.password});if(error)throw error;await openDashboard(data.user);}
  catch{$('#staff-login-status').textContent='Sign-in failed. Check your staff email, password and Supabase Auth setup.';}
  finally{button.disabled=false;}
});
$('#staff-sign-out').addEventListener('click',async()=>{await db.auth.signOut();staffId=null;$('#staff-dashboard').hidden=true;$('#staff-login-panel').hidden=false;$('#staff-login-status').textContent='You are signed out.';});
$('#staff-refresh').addEventListener('click',loadBusinesses);
$('#staff-search').addEventListener('input',renderBusinesses);
$('#staff-status-filter').addEventListener('change',renderBusinesses);
$('#staff-response-filter').addEventListener('change',renderBusinesses);

async function loadBusinesses(){
  $('#staff-data-status').textContent='Loading assigned businesses...';
  const [businessResult,historyResult]=await Promise.all([
    db.from('business_calls').select('id,business_name,contact_number,call_status,response,follow_up_date,notes,updated_at').eq('assigned_to',staffId).order('business_name'),
    db.from('call_attempts').select('id,business_id,response,follow_up_date,notes,attempted_at').eq('staff_id',staffId).order('attempted_at',{ascending:false})
  ]);
  if(businessResult.error||historyResult.error){$('#staff-data-status').textContent='Could not load assigned businesses. Ask your administrator to apply the Staff & Business Calls schema.';return;}
  records=businessResult.data||[];history=historyResult.data||[];
  $('#staff-progress').textContent=`${records.filter(record=>record.call_status==='Called').length} of ${records.length} businesses have a saved call result.`;
  $('#staff-response-filter').innerHTML='<option value="">All responses</option>'+responses.map(response=>`<option>${esc(response)}</option>`).join('');
  renderBusinesses();
}

function renderBusinesses(){
  const query=$('#staff-search').value.trim().toLowerCase();const status=$('#staff-status-filter').value;const response=$('#staff-response-filter').value;
  const list=records.filter(record=>(!query||`${record.business_name} ${record.contact_number}`.toLowerCase().includes(query))&&(!status||record.call_status===status)&&(!response||record.response===response));
  $('#staff-business-list').innerHTML=list.map(record=>{
    const index=records.indexOf(record);const options='<option value="">Choose outcome</option>'+responses.map(item=>`<option value="${esc(item)}" ${record.response===item?'selected':''}>${esc(item)}</option>`).join('');
    return `<tr data-business-id="${esc(record.id)}"><td>${esc(record.business_name)}<details class="attempt-history"><summary>Call history (${history.filter(item=>item.business_id===record.id).length})</summary>${renderHistory(record.id)}</details></td><td><a href="tel:${esc(record.contact_number)}">${esc(record.contact_number)}</a></td><td>${esc(record.call_status)}</td><td><select data-field="response" aria-label="Call response">${options}</select></td><td><input data-field="follow_up_date" type="date" value="${esc(record.follow_up_date||'')}" aria-label="Follow-up date"></td><td><textarea data-field="notes" rows="2" maxlength="5000" aria-label="Call notes">${esc(record.notes||'')}</textarea></td><td><div class="staff-actions"><a class="admin-button admin-button-quiet call-now" href="tel:${esc(record.contact_number)}">Call Now</a><button class="admin-button save-response" type="button">Save Response</button><button class="row-action next-business" type="button" data-index="${index}">Next Business</button></div></td></tr>`;
  }).join('')||'<tr><td colspan="7">No assigned businesses match your search.</td></tr>';
  $('#staff-business-list').querySelectorAll('.save-response').forEach(button=>button.addEventListener('click',()=>saveResponse(button)));
  $('#staff-business-list').querySelectorAll('.next-business').forEach(button=>button.addEventListener('click',()=>{
    const next=button.closest('tr').nextElementSibling;
    if(next?.querySelector('[data-field="response"]'))next.querySelector('[data-field="response"]').focus();
    else $('#staff-data-status').textContent='You have reached the end of the filtered business list.';
  }));
}

function renderHistory(id){
  const entries=history.filter(item=>item.business_id===id);
  return entries.length?entries.map(item=>`<div class="attempt-row"><b>${esc(item.response)}</b><time>${esc(new Date(item.attempted_at).toLocaleString())}</time><span>${item.follow_up_date?`Follow-up ${esc(item.follow_up_date)} · `:''}${esc(item.notes||'No notes')}</span></div>`).join(''):'<p>No saved call attempts.</p>';
}

async function saveResponse(button){
  const row=button.closest('tr');const id=row.dataset.businessId;const response=row.querySelector('[data-field="response"]').value;const followUp=row.querySelector('[data-field="follow_up_date"]').value||null;const notes=row.querySelector('[data-field="notes"]').value.trim();
  if(!response){$('#staff-data-status').textContent='Choose a response before saving.';row.querySelector('[data-field="response"]').focus();return;}
  button.disabled=true;$('#staff-data-status').textContent='Saving call result...';
  const {error:historyError}=await db.from('call_attempts').insert({business_id:id,staff_id:staffId,response,follow_up_date:followUp,notes});
  if(historyError){$('#staff-data-status').textContent='Could not save this call attempt. Check your connection and assigned access.';button.disabled=false;return;}
  const {error:updateError}=await db.from('business_calls').update({call_status:'Called',response,follow_up_date:followUp,notes}).eq('id',id).eq('assigned_to',staffId);
  if(updateError){$('#staff-data-status').textContent='The call attempt was added to history, but the latest result could not be updated. Refresh and try again.';button.disabled=false;await loadBusinesses();return;}
  await loadBusinesses();
  $('#staff-data-status').textContent='Call response saved. Your previous call attempts remain in history.';
}
