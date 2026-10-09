import { createClient } from '@supabase/supabase-js';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const db = url && key ? createClient(url, key) : null;
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const responseOptions = ['Interested','Not Interested',"Didn't Attend / No Answer",'Busy','Switched Off','Number Invalid','Call Back Later','Follow-up Required','Already Has a Website','Asked to Send Demo','Demo Sent','Converted to Client'];
let staff = [];
let businesses = [];
let attempts = [];
let pendingImport = [];
const selectedBusinessIds = new Set();
let assignmentOpen = false;

window.addEventListener('upvebx-admin-ready', loadCalls);
window.addEventListener('upvebx-admin-signed-out', () => { $('#call-metrics').replaceChildren(); $('#business-list').replaceChildren(); });
$('#refresh-calls').addEventListener('click', loadCalls);
document.querySelectorAll('[data-refresh-calls]').forEach(button=>button.addEventListener('click',loadCalls));
$('#business-search').addEventListener('input', renderBusinesses);
$('#business-filter').addEventListener('change', renderBusinesses);
$('#staff-filter').addEventListener('change', renderBusinesses);
$('#assignment-staff').addEventListener('change', renderAssignmentPerson);
$('#select-visible-businesses').addEventListener('change', event => {
  const visibleIds = [...document.querySelectorAll('[data-business-select]')].map(input=>input.dataset.businessSelect);
  for (const id of visibleIds) event.currentTarget.checked ? selectedBusinessIds.add(id) : selectedBusinessIds.delete(id);
  renderBusinesses();
});
$('#assign-selected').addEventListener('click', assignSelectedBusinesses);
$('#toggle-assignment').addEventListener('click', () => {
  assignmentOpen = !assignmentOpen;
  if (assignmentOpen) { $('#staff-filter').value=''; renderBusinesses(); }
  else { selectedBusinessIds.clear(); renderBusinesses(); }
  $('#assignment-box').hidden = !assignmentOpen;
  $('#toggle-assignment').textContent = assignmentOpen ? 'Close assignment' : 'Assign work';
  if (assignmentOpen) $('#assignment-box').scrollIntoView({block:'nearest',behavior:'smooth'});
});

async function loadCalls() {
  if (!db) return;
  $('#calls-status').textContent = 'Loading staff and business call data...';
  const [staffResult, businessResult, attemptsResult] = await Promise.all([
    db.from('staff_profiles').select('user_id,full_name,email,active,created_at').order('full_name'),
    db.from('business_calls').select('id,business_name,contact_number,assigned_to,call_status,response,follow_up_date,notes,created_at,updated_at').order('created_at', {ascending:false}),
    db.from('call_attempts').select('business_id,staff_id,response,follow_up_date,notes,attempted_at').order('attempted_at', {ascending:false})
  ]);
  if (staffResult.error || businessResult.error || attemptsResult.error) {
    $('#calls-status').textContent = 'Could not load calling data. Run the Staff & Business Calls SQL section in supabase-schema.sql and sign in as an admin.';
    return;
  }
  staff = staffResult.data || [];
  businesses = businessResult.data || [];
  attempts = attemptsResult.data || [];
  for (const id of selectedBusinessIds) if (!businesses.some(record=>record.id===id)) selectedBusinessIds.delete(id);
  renderStaff(); renderMetrics(); renderInterestedContacts(); renderAssignmentOptions(); renderBusinesses(); renderAssignmentPerson();
  $('#calls-status').textContent = businesses.length ? `${businesses.length} business record${businesses.length === 1 ? '' : 's'} loaded.` : 'No business records imported yet.';
}

function renderStaff() {
  $('#staff-list').innerHTML = staff.length ? staff.map(person => `<div class="staff-row"><span><b>${escapeHTML(person.full_name)}</b><small>${escapeHTML(person.email)} · ${escapeHTML(person.active ? 'Active' : 'Disabled')}</small></span><button type="button" class="row-action" data-staff-id="${escapeHTML(person.user_id)}">${person.active ? 'Disable' : 'Enable'}</button></div>`).join('') : '<p class="admin-status">No staff accounts yet.</p>';
  $('#staff-filter').innerHTML = '<option value="">All staff</option>' + staff.map(person => `<option value="${escapeHTML(person.user_id)}">${escapeHTML(person.full_name)}</option>`).join('');
  $('#staff-list').querySelectorAll('[data-staff-id]').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    const person = staff.find(item => item.user_id === button.dataset.staffId);
    const {error} = await db.from('staff_profiles').update({active:!person.active}).eq('user_id', person.user_id);
    if (error) $('#staff-status').textContent = 'Could not update staff account. Check the schema and admin access.';
    await loadCalls();
  }));
}

function renderAssignmentOptions() {
  const select = $('#assignment-staff');
  const previous = select.value;
  select.innerHTML = '<option value="">Select a staff member</option>' + staff.filter(person=>person.active).map(person=>`<option value="${escapeHTML(person.user_id)}">${escapeHTML(person.full_name)}</option>`).join('');
  if(staff.some(person=>person.user_id===previous&&person.active))select.value=previous;
}

function renderAssignmentPerson() {
  const person = staff.find(item=>item.user_id===$('#assignment-staff').value);
  const panel = $('#assignment-person');
  if (!person) { panel.innerHTML='<span class="assignment-placeholder">Select a staff member to view their details and current workload.</span>'; updateAssignButton(); return; }
  const assigned=businesses.filter(record=>record.assigned_to===person.user_id);
  const pending=assigned.filter(record=>record.call_status==='Not Called').length;
  const completed=assigned.filter(record=>record.call_status==='Called').length;
  const interested=assigned.filter(record=>record.response==='Interested').length;
  panel.innerHTML=`<div class="assignment-profile"><span class="profile-avatar">${escapeHTML(person.full_name.trim().slice(0,1).toUpperCase())}</span><span><b>${escapeHTML(person.full_name)}</b><small>${escapeHTML(person.email)} · Active staff</small></span></div><div class="assignment-stats"><span><b>${assigned.length}</b> assigned</span><span><b>${pending}</b> not called</span><span><b>${completed}</b> completed</span><span><b>${interested}</b> interested</span></div>`;
  updateAssignButton();
}

function updateAssignButton() {
  const target=$('#assignment-staff').value;
  const button=$('#assign-selected');
  $('#assignment-box').hidden=!assignmentOpen;
  $('#toggle-assignment').textContent=assignmentOpen?'Close assignment':'Assign work';
  button.disabled=!target||selectedBusinessIds.size===0;
  button.textContent=selectedBusinessIds.size?`Assign ${selectedBusinessIds.size} selected`:'Assign selected';
}

async function assignSelectedBusinesses() {
  const staffId=$('#assignment-staff').value;
  const ids=[...selectedBusinessIds];
  if(!staffId||!ids.length)return;
  const button=$('#assign-selected');button.disabled=true;$('#calls-status').textContent=`Assigning ${ids.length} business${ids.length===1?'':'es'}...`;
  const {error}=await db.from('business_calls').update({assigned_to:staffId}).in('id',ids);
  if(error){$('#calls-status').textContent='Could not assign the selected businesses. Refresh the data and try again.';updateAssignButton();return;}
  selectedBusinessIds.clear();
  assignmentOpen=false;
  $('#calls-status').textContent=`Assigned ${ids.length} business${ids.length===1?'':'es'} to ${staff.find(person=>person.user_id===staffId)?.full_name||'staff member'}.`;
  await loadCalls();
  $('#calls-status').textContent=`Assigned ${ids.length} business${ids.length===1?'':'es'} to ${staff.find(person=>person.user_id===staffId)?.full_name||'staff member'}.`;
}

function renderMetrics() {
  const total = businesses.length;
  const count = predicate => businesses.filter(predicate).length;
  const pending = count(record => record.follow_up_date && record.response !== 'Converted to Client');
  const values = [
    ['Total assigned businesses',count(record => !!record.assigned_to)],
    ['Not yet called',count(record => record.call_status === 'Not Called')],
    ['Calls completed',count(record => record.call_status === 'Called')],
    ['Interested',count(record => record.response === 'Interested')],
    ['Not interested',count(record => record.response === 'Not Interested')],
    ['No answer',count(record => record.response === "Didn't Attend / No Answer")],
    ['Follow-ups pending',pending]
  ];
  $('#call-metrics').innerHTML = values.map(([label,value]) => `<article><span>${escapeHTML(label)}</span><b>${value}</b></article>`).join('') + staff.map(person => {
    const assigned = businesses.filter(record => record.assigned_to === person.user_id);
    const completed = assigned.filter(record => record.call_status === 'Called').length;
    const interested = assigned.filter(record => record.response === 'Interested').length;
    const converted = assigned.filter(record => record.response === 'Converted to Client').length;
    return `<article class="staff-metric"><span>${escapeHTML(person.full_name)}</span><b>${completed}/${assigned.length} called</b><small>${interested} interested · ${converted} converted</small></article>`;
  }).join('');
  $('#call-metrics').dataset.total = String(total);
}

function renderInterestedContacts() {
  const interested=businesses.filter(record=>record.response==='Interested').sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at));
  $('#interested-count').textContent=`${interested.length} contact${interested.length===1?'':'s'}`;
  $('#interested-contact-list').innerHTML=interested.map(record=>{
    const owner=staff.find(person=>person.user_id===record.assigned_to);
    return `<tr><td><strong>${escapeHTML(record.business_name)}</strong></td><td><a href="tel:${escapeHTML(record.contact_number)}">${escapeHTML(record.contact_number)}</a></td><td>${escapeHTML(owner?.full_name||'Unassigned')}</td><td>${escapeHTML(record.follow_up_date||'—')}</td><td class="notes-cell">${escapeHTML(record.notes||'—')}</td></tr>`;
  }).join('')||'<tr><td colspan="5">No interested businesses have been saved yet.</td></tr>';
}

function renderBusinesses() {
  const query = $('#business-search').value.trim().toLowerCase();
  const status = $('#business-filter').value;
  const staffId = $('#staff-filter').value;
  const filtered = businesses.filter(record => {
    const owner = staff.find(person => person.user_id === record.assigned_to);
    const response = record.response || '';
    const matchesStatus = !status || status === record.call_status || status === response || (status === 'No Answer' && response === "Didn't Attend / No Answer") || (status === 'Follow-up Pending' && record.follow_up_date && record.follow_up_date >= new Date().toISOString().slice(0,10));
    return (!query || `${record.business_name} ${record.contact_number}`.toLowerCase().includes(query)) && matchesStatus && (!staffId || record.assigned_to === staffId);
  });
  $('#business-list').innerHTML = filtered.map(record => {
    const recordAttempts = attempts.filter(attempt => attempt.business_id === record.id);
    const history = recordAttempts.length ? `<details class="attempt-history"><summary>View history</summary>${recordAttempts.map(attempt=>`<div class="attempt-row"><b>${escapeHTML(attempt.response)} · ${escapeHTML(staff.find(person=>person.user_id===attempt.staff_id)?.full_name||'Staff')}</b><time>${escapeHTML(new Date(attempt.attempted_at).toLocaleString())}</time><span>${attempt.follow_up_date?`Follow-up ${escapeHTML(attempt.follow_up_date)} · `:''}${escapeHTML(attempt.notes||'No notes')}</span></div>`).join('')}</details>` : '—';
    const owner=staff.find(person=>person.user_id===record.assigned_to);
    return `<tr><td><input type="checkbox" data-business-select="${escapeHTML(record.id)}" aria-label="Select ${escapeHTML(record.business_name)}" ${selectedBusinessIds.has(record.id)?'checked':''}></td><td>${escapeHTML(record.business_name)}</td><td><a href="tel:${escapeHTML(record.contact_number)}">${escapeHTML(record.contact_number)}</a></td><td>${escapeHTML(owner?.full_name||'Unassigned')}</td><td>${escapeHTML(record.call_status)}</td><td>${escapeHTML(record.response || '—')}</td><td>${escapeHTML(record.follow_up_date || '—')}</td><td class="notes-cell">${escapeHTML(record.notes || '—')}</td><td>${recordAttempts.length}${history}</td></tr>`;
  }).join('') || '<tr><td colspan="9">No matching records.</td></tr>';
  $('#business-list').querySelectorAll('[data-business-select]').forEach(input=>input.addEventListener('change',()=>{
    if(input.checked)assignmentOpen=true;
    input.checked?selectedBusinessIds.add(input.dataset.businessSelect):selectedBusinessIds.delete(input.dataset.businessSelect);
    updateAssignButton();
    const allVisible=[...document.querySelectorAll('[data-business-select]')];
    $('#select-visible-businesses').checked=allVisible.length>0&&allVisible.every(item=>item.checked);
  }));
  const visible=[...document.querySelectorAll('[data-business-select]')];
  $('#select-visible-businesses').checked=visible.length>0&&visible.every(item=>item.checked);
  updateAssignButton();
}

$('#staff-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  const status = $('#staff-status');
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true; status.textContent = 'Creating account...';
  try {
    const authClient = createClient(url, key, {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data,error} = await authClient.auth.signUp({email:values.email.trim(),password:values.password,options:{data:{full_name:values.full_name.trim()}}});
    if (error) throw error;
    if (!data.user?.id) throw new Error('Supabase did not return an account ID. Check Supabase Auth configuration and try again.');
    const {error:profileError} = await db.from('staff_profiles').insert({user_id:data.user.id,full_name:values.full_name.trim(),email:values.email.trim().toLowerCase()});
    if (profileError?.code === '23503' || profileError?.code === '23505') {
      throw new Error('This email is already registered or could not be created as a new account. Staff need a unique email address that is not already used by an admin or another staff member.');
    }
    if (profileError) throw profileError;
    form.reset(); status.textContent = data.session ? 'Staff account created and ready to sign in.' : 'Staff account created. They must confirm their email before signing in.';
    await loadCalls();
  } catch (error) { status.textContent = error?.message || 'Could not create the staff account.'; }
  finally { button.disabled = false; }
});

$('#pdf-form').addEventListener('submit', async event => {
  event.preventDefault();
  const file = event.currentTarget.elements.pdf.files[0];
  const status = $('#pdf-status');
  const button = event.currentTarget.querySelector('button');
  $('#pdf-preview').replaceChildren(); pendingImport = [];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { status.textContent = 'The PDF must be 20 MB or smaller.'; return; }
  button.disabled = true; status.textContent = 'Reading PDF pages...';
  try {
    const signature = new Uint8Array(await file.slice(0,5).arrayBuffer());
    if (String.fromCharCode(...signature) !== '%PDF-') throw new Error('This file is not a valid PDF. Choose a readable PDF and try again.');
    const pdf = await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
    const lines = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const groups = new Map();
      for (const item of content.items) {
        if (!item.str?.trim()) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        groups.set(y, [...(groups.get(y) || []), {x:item.transform[4], text:item.str.trim()}]);
      }
      for (const [,items] of [...groups].sort((a,b)=>b[0]-a[0])) lines.push(items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ').replace(/\s+/g,' ').trim());
    }
    pendingImport = extractRecords(lines);
    if (!pendingImport.length) throw new Error('No business names and phone numbers could be extracted. This PDF may be scanned or use an unsupported layout. Use a text based PDF with one business and number per line.');
    flagDuplicates(); renderPreview();
    status.textContent = `Extracted ${pendingImport.length} record${pendingImport.length===1?'':'s'} from ${pdf.numPages} page${pdf.numPages===1?'':'s'}. Review and correct before importing.`;
  } catch (error) { status.textContent = error?.message || 'The PDF could not be processed. Try a text based PDF with business names and phone numbers.'; }
  finally { button.disabled = false; }
});

function extractRecords(lines) {
  const records = [];
  const phonePattern = /(?:\+?\d[\d\s()./-]{5,}\d)/g;
  for (const line of lines) {
    const phones = [...line.matchAll(phonePattern)];
    if (!phones.length) continue;
    let remainder = line;
    for (const match of phones) remainder = remainder.replace(match[0], ' ');
    const business = remainder.replace(/[|,;:\-–—]+/g,' ').replace(/\s+/g,' ').trim();
    if (!business || /^(business|company|name|phone|contact|mobile|number)$/i.test(business)) continue;
    for (const match of phones) {
      const phone = match[0].replace(/[^\d+]/g,'');
      if (phone.replace(/\D/g,'').length >= 7 && phone.replace(/\D/g,'').length <= 15) records.push({business_name:business,contact_number:phone,duplicate:false,selected:true});
    }
  }
  return records;
}

function flagDuplicates() {
  const seenNamesAndPhones = new Set(businesses.map(record => `${record.business_name.trim().toLowerCase()}|${record.contact_number.replace(/\D/g,'')}`));
  const seenPhones = new Set(businesses.map(record => record.contact_number.replace(/\D/g,'')));
  for (const record of pendingImport) {
    const phone = record.contact_number.replace(/\D/g,'');
    const key = `${record.business_name.trim().toLowerCase()}|${phone}`;
    record.duplicate = seenNamesAndPhones.has(key) || seenPhones.has(phone);
    if (record.duplicate) record.selected = false;
    seenNamesAndPhones.add(key); seenPhones.add(phone);
  }
}

function renderPreview() {
  const duplicateCount = pendingImport.filter(record => record.duplicate).length;
  $('#pdf-preview').innerHTML = `<p class="admin-status">${duplicateCount} duplicate${duplicateCount===1?'':'s'} detected by contact number. Duplicates are unchecked.</p><div class="business-table-wrap"><table class="business-table"><thead><tr><th>Import</th><th>Business name</th><th>Contact number</th><th>Duplicate</th><th>Assign to</th></tr></thead><tbody>${pendingImport.map((record,index)=>`<tr class="${record.duplicate?'duplicate-row':''}"><td><input type="checkbox" data-import-select="${index}" ${record.selected?'checked':''}></td><td><input type="text" data-import-name="${index}" value="${escapeHTML(record.business_name)}"></td><td><input type="tel" data-import-phone="${index}" value="${escapeHTML(record.contact_number)}"></td><td>${record.duplicate?'Already imported / duplicate':'—'}</td><td><select data-import-staff="${index}"><option value="">Unassigned</option>${staff.filter(person=>person.active).map(person=>`<option value="${escapeHTML(person.user_id)}">${escapeHTML(person.full_name)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div><button type="button" class="admin-button" id="import-businesses">Import selected businesses</button>`;
  $('#pdf-preview').querySelectorAll('[data-import-select]').forEach(input=>input.addEventListener('change',()=>pendingImport[Number(input.dataset.importSelect)].selected=input.checked));
  $('#pdf-preview').querySelectorAll('[data-import-name]').forEach(input=>input.addEventListener('input',()=>{pendingImport[Number(input.dataset.importName)].business_name=input.value;pendingImport[Number(input.dataset.importName)].duplicate=false;}));
  $('#pdf-preview').querySelectorAll('[data-import-phone]').forEach(input=>input.addEventListener('input',()=>{pendingImport[Number(input.dataset.importPhone)].contact_number=input.value;pendingImport[Number(input.dataset.importPhone)].duplicate=false;}));
  $('#import-businesses').addEventListener('click', importBusinesses);
}

async function importBusinesses() {
  const chosen = [...document.querySelectorAll('[data-import-select]:checked')].map(input=>pendingImport[Number(input.dataset.importSelect)]);
  const selectedPhones = new Set();
  const duplicate = chosen.find(record=>{
    const phone=record.contact_number.replace(/\D/g,'');
    const exists=businesses.some(saved=>saved.contact_number.replace(/\D/g,'')===phone);
    const alreadySelected=selectedPhones.has(phone);selectedPhones.add(phone);
    return exists||alreadySelected;
  });
  if (duplicate) { $('#pdf-status').textContent='A selected phone number is already in the database or selected more than once. Uncheck duplicate records or correct the numbers.'; return; }
  const invalid = chosen.find(record => !record.business_name.trim() || !/^\+?[0-9][0-9 .()/-]{5,24}$/.test(record.contact_number.trim()) || record.contact_number.replace(/\D/g,'').length > 15);
  if (invalid) { $('#pdf-status').textContent = 'Correct every selected business name and phone number before import.'; return; }
  const button = $('#import-businesses'); button.disabled = true;
  const rows = chosen.map(record=>({business_name:record.business_name.trim(),contact_number:record.contact_number.trim(),assigned_to:document.querySelector(`[data-import-staff="${pendingImport.indexOf(record)}"]`).value||null}));
  const {error} = await db.from('business_calls').insert(rows);
  if (error) { $('#pdf-status').textContent = 'Import failed. Check the phone numbers and admin access, then try again.'; button.disabled=false; return; }
  $('#pdf-status').textContent = `${rows.length} business record${rows.length===1?'':'s'} imported.`; $('#pdf-preview').replaceChildren(); $('#pdf-form').reset(); await loadCalls();
}

$('#export-calls').addEventListener('click', () => {
  const query = $('#business-search').value.trim().toLowerCase();
  const status = $('#business-filter').value;
  const staffId = $('#staff-filter').value;
  const data = businesses.filter(record => {
    const response = record.response || '';
    const owner = staff.find(person=>person.user_id===record.assigned_to);
    const matchesStatus = !status || status===record.call_status || status===response || (status==='No Answer'&&response==="Didn't Attend / No Answer") || (status==='Follow-up Pending'&&record.follow_up_date&&record.follow_up_date>=new Date().toISOString().slice(0,10));
    return (!query||`${record.business_name} ${record.contact_number}`.toLowerCase().includes(query))&&matchesStatus&&(!staffId||record.assigned_to===staffId);
  });
  const columns = ['Business Name','Contact Number','Assigned Staff','Call Status','Response','Follow-up Date','Notes','Call Attempts'];
  const csv = [columns,...data.map(record=>[record.business_name,record.contact_number,staff.find(person=>person.user_id===record.assigned_to)?.full_name||'',record.call_status,record.response||'',record.follow_up_date||'',record.notes,attempts.filter(attempt=>attempt.business_id===record.id).length])].map(row=>row.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
  const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));link.download='upvebx-business-calls.csv';link.click();URL.revokeObjectURL(link.href);
});
