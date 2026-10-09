import { createClient } from '@supabase/supabase-js';
import './admin.css';

const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase=url&&key?createClient(url,key):null;
const $=selector=>document.querySelector(selector);
const loginPanel=$('#login-panel');
const dashboard=$('#dashboard');
const loginStatus=$('#login-status');
const projectStatus=$('#project-status');
const listStatus=$('#list-status');
const enquiryStatus=$('#enquiry-status');
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function activateAdminView(view){
 document.querySelectorAll('[data-admin-page]').forEach(page=>page.classList.toggle('active',page.dataset.adminPage===view));
 document.querySelectorAll('[data-admin-view]').forEach(button=>{
  const active=button.dataset.adminView===view;
  button.classList.toggle('active',active);
  if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 });
}
document.querySelectorAll('[data-admin-view]').forEach(button=>button.addEventListener('click',()=>activateAdminView(button.dataset.adminView)));

if(!supabase){loginStatus.textContent='Supabase is not configured. Add the project URL and publishable key to .env.local, then restart the dev server.';$('#login-form').hidden=true}

async function showAdmin(user){
 const {data,error}=await supabase.rpc('is_upvebx_admin');
 if(error||data!==true){loginPanel.hidden=false;dashboard.hidden=true;loginStatus.textContent='This account is not approved for portfolio management. Follow the first-time setup steps below, then sign in again.';return}
 loginPanel.hidden=true;dashboard.hidden=false;$('#admin-login-heading').hidden=true;activateAdminView('finance');
 await loadProjects();
 await loadEnquiries();
 window.dispatchEvent(new CustomEvent('upvebx-admin-ready'));
}

async function loadSession(){
 if(!supabase)return;
 const {data:{session}}=await supabase.auth.getSession();
 if(session)await showAdmin(session.user);
}
loadSession();

$('#login-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!supabase)return;
 const form=event.currentTarget;const button=form.querySelector('button');button.disabled=true;loginStatus.textContent='Signing in...';
 try{
  const values=Object.fromEntries(new FormData(form));
  const {data,error}=await supabase.auth.signInWithPassword({email:values.email,password:values.password});
  if(error)throw error;
  await showAdmin(data.user);
 }catch{loginStatus.textContent='Sign-in failed. Check the account details and Supabase Auth setup.'}
 finally{button.disabled=false}
});

$('#sign-out').addEventListener('click',async()=>{await supabase.auth.signOut();dashboard.hidden=true;loginPanel.hidden=false;$('#admin-login-heading').hidden=false;loginStatus.textContent='You are signed out.';window.dispatchEvent(new CustomEvent('upvebx-admin-signed-out'))});
$('#refresh-projects').addEventListener('click',loadProjects);
$('#refresh-enquiries').addEventListener('click',loadEnquiries);

async function loadEnquiries(){
 if(!supabase)return;
 enquiryStatus.textContent='Loading enquiries...';
 const {data,error}=await supabase.from('enquiries').select('id,name,business_name,phone,email,service,budget,message,created_at').order('created_at',{ascending:false});
 if(error){enquiryStatus.textContent='Could not load enquiries. Run the latest supabase-schema.sql and sign in with an approved admin account.';return}
 const list=$('#enquiry-list');
 if(!data?.length){list.innerHTML='';enquiryStatus.textContent='No enquiries received yet.';return}
 enquiryStatus.textContent='';
 list.innerHTML=data.map(e=>{
  const waText=`Hi ${e.name}, this is UPVebx following up on your website enquiry.`;
  const waLink=`https://wa.me/${String(e.phone).replace(/\D/g,'')}?text=${encodeURIComponent(waText)}`;
  const date=new Date(e.created_at).toLocaleString();
  return `<article class="enquiry-row"><div class="enquiry-top"><div><span class="eyebrow">${escapeHTML(e.service)} · ${escapeHTML(e.budget)}</span><h3>${escapeHTML(e.name)} <small>· ${escapeHTML(e.business_name)}</small></h3></div><time>${escapeHTML(date)}</time></div><div class="enquiry-contact"><a href="tel:${escapeHTML(e.phone)}">${escapeHTML(e.phone)}</a><a href="mailto:${escapeHTML(e.email)}">${escapeHTML(e.email)}</a><a class="row-action" href="${escapeHTML(waLink)}" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a></div><p>${escapeHTML(e.message)}</p></article>`;
 }).join('');
}

async function loadProjects(){
 if(!supabase)return;
 listStatus.textContent='Loading projects...';
 const {data,error}=await supabase.from('projects').select('id,title,category,description,project_url,image_url,is_published,created_at').order('created_at',{ascending:false});
 if(error){listStatus.textContent='Could not load projects. Confirm the schema has been run and this account is an admin.';return}
 const list=$('#project-list');
 if(!data?.length){list.innerHTML='';listStatus.textContent='No website entries yet.';return}
 listStatus.textContent='';
 list.innerHTML=data.map(p=>`<article class="project-row" data-id="${escapeHTML(p.id)}"><div><span class="eyebrow">${escapeHTML(p.category)} · ${p.is_published?'PUBLISHED':'DRAFT'}</span><h3>${escapeHTML(p.title)}</h3><a href="${escapeHTML(p.project_url)}" target="_blank" rel="noopener noreferrer">Open website ↗</a></div><div class="row-actions"><button type="button" class="row-action" data-action="toggle">${p.is_published?'Unpublish':'Publish'}</button><button type="button" class="row-action row-delete" data-action="delete">Delete</button></div></article>`).join('');
 list.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>manageProject(button)));
}

async function manageProject(button){
 const row=button.closest('.project-row');const id=row.dataset.id;const action=button.dataset.action;
 if(action==='delete'&&!confirm('Delete this website entry?'))return;
 button.disabled=true;listStatus.textContent=action==='delete'?'Deleting project...':'Updating project...';
 if(action==='delete'){
  const {error}=await supabase.from('projects').delete().eq('id',id);
  if(error){listStatus.textContent='Could not delete this project.';button.disabled=false;return}
 }else{
  const {error}=await supabase.from('projects').update({is_published:button.textContent==='Publish'}).eq('id',id);
  if(error){listStatus.textContent='Could not update this project.';button.disabled=false;return}
 }
 await loadProjects();
}

$('#project-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget;const button=$('#save-project');
 if(!form.reportValidity())return;
 const values=Object.fromEntries(new FormData(form));const file=form.elements.preview.files[0];
 if(file&&file.size>5*1024*1024){projectStatus.textContent='The preview image must be 5 MB or smaller.';return}
 if(file&&!['image/jpeg','image/png','image/webp'].includes(file.type)){projectStatus.textContent='Choose a PNG, JPG or WebP image.';return}
 button.disabled=true;projectStatus.textContent='Saving website...';let uploadedPath=null;let imageUrl=null;
 try{
  if(file){const ext=file.type==='image/jpeg'?'jpg':file.type.split('/')[1];uploadedPath=`${crypto.randomUUID()}.${ext}`;const {error:uploadError}=await supabase.storage.from('portfolio-previews').upload(uploadedPath,file,{contentType:file.type,upsert:false});if(uploadError)throw uploadError;imageUrl=supabase.storage.from('portfolio-previews').getPublicUrl(uploadedPath).data.publicUrl}
  const {error}=await supabase.from('projects').insert({title:values.title.trim(),category:values.category,description:values.description.trim(),project_url:values.project_url.trim(),image_url:imageUrl,is_published:values.is_published==='on'});
  if(error)throw error;
  form.reset();form.elements.is_published.checked=true;projectStatus.textContent='Website added to the portfolio.';await loadProjects();
 }catch(error){if(uploadedPath)await supabase.storage.from('portfolio-previews').remove([uploadedPath]);projectStatus.textContent=error?.message||'Could not save the website. Check your admin access and try again.'}
 finally{button.disabled=false}
});

import './calls-admin.js';
import './finance-admin.js';
