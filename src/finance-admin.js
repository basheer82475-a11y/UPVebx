import { createClient } from '@supabase/supabase-js';

const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||import.meta.env.VITE_SUPABASE_ANON_KEY;
const db=url&&key?createClient(url,key):null;
const $=selector=>document.querySelector(selector);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(value)||0);
let projects=[];
let expenses=[];

window.addEventListener('upvebx-admin-ready',loadFinance);
$('#refresh-finance').addEventListener('click',loadFinance);
$('#finance-project-form').addEventListener('submit',saveFinanceProject);
$('#finance-expense-form').addEventListener('submit',saveExpense);
$('#finance-project-list').addEventListener('click',deleteFinanceProject);

async function loadFinance(){
  if(!db)return;
  $('#finance-status').textContent='Loading saved website budgets and expenses...';
  const [projectResult,expenseResult]=await Promise.all([
    db.from('finance_projects').select('id,website_name,total_budget,created_at').order('created_at',{ascending:false}),
    db.from('website_expenses').select('id,finance_project_id,category,amount,description,spent_on,created_at').order('spent_on',{ascending:false})
  ]);
  if(projectResult.error||expenseResult.error){
    renderFinance();
    $('#finance-status').textContent=explainFinanceError(projectResult.error||expenseResult.error,'finance records');
    $('#finance-expense-status').textContent='Expense entry is disabled until the finance tables are set up.';
    return;
  }
  projects=projectResult.data||[];expenses=expenseResult.data||[];
  renderFinance();
  $('#finance-status').textContent=projects.length?`${projects.length} website budget${projects.length===1?'':'s'} loaded.`:'No website budgets added yet.';
}

function renderFinance(){
  const revenue=projects.reduce((total,project)=>total+Number(project.total_budget),0);
  const spent=expenses.reduce((total,expense)=>total+Number(expense.amount),0);
  const profit=revenue-spent;
  $('#finance-metrics').innerHTML=[['Total budget / revenue',revenue],['Total expenses',spent],['Estimated profit',profit]].map(([label,value],index)=>`<article class="finance-metric ${index===2?'profit-metric':''}"><span>${escapeHTML(label)}</span><b>${escapeHTML(money(value))}</b><small>${index===2?'Revenue minus all recorded expenses':'Across all website projects'}</small></article>`).join('');
  const select=$('#finance-project-select');
  const previous=select.value;
  select.innerHTML=projects.length?'<option value="">Select a website project</option>'+projects.map(project=>`<option value="${escapeHTML(project.id)}">${escapeHTML(project.website_name)}</option>`).join(''):'<option value="">Add a website budget first</option>';
  if(projects.some(project=>project.id===previous))select.value=previous;
  const canAddExpense=projects.length>0;
  select.disabled=!canAddExpense;
  $('#finance-expense-form').querySelector('button[type="submit"]').disabled=!canAddExpense;
  $('#finance-expense-status').textContent=canAddExpense?'':'Save a website budget first to enable expense entry.';
  $('#finance-project-list').innerHTML=projects.map(project=>{
    const projectExpenses=expenses.filter(expense=>expense.finance_project_id===project.id);
    const spentForProject=projectExpenses.reduce((total,expense)=>total+Number(expense.amount),0);
    const profitForProject=Number(project.total_budget)-spentForProject;
    const details=projectExpenses.length?`<details class="finance-expense-details"><summary>${projectExpenses.length} expense${projectExpenses.length===1?'':'s'} · ${escapeHTML(money(spentForProject))}</summary><div class="finance-expense-list">${projectExpenses.map(expense=>`<article><span class="expense-tag">${escapeHTML(expense.category)}</span><span>${escapeHTML(expense.description)}</span><time>${escapeHTML(expense.spent_on)}</time><b>${escapeHTML(money(expense.amount))}</b></article>`).join('')}</div></details>`:'<span class="no-expenses">No expenses recorded</span>';
    return `<tr><td><strong>${escapeHTML(project.website_name)}</strong></td><td>${escapeHTML(money(project.total_budget))}</td><td>${escapeHTML(money(spentForProject))}</td><td class="${profitForProject<0?'negative-profit':'positive-profit'}">${escapeHTML(money(profitForProject))}</td><td>${details}</td><td><button type="button" class="row-action row-delete" data-delete-finance-project="${escapeHTML(project.id)}">Delete budget</button></td></tr>`;
  }).join('')||'<tr><td colspan="6">Add a website budget to start tracking revenue and expenses.</td></tr>';
}

async function deleteFinanceProject(event){
  const button=event.target.closest('[data-delete-finance-project]');
  if(!button)return;
  const project=projects.find(item=>item.id===button.dataset.deleteFinanceProject);
  if(!project)return;
  const linkedExpenses=expenses.filter(item=>item.finance_project_id===project.id).length;
  const expenseMessage=linkedExpenses?` This will also permanently delete ${linkedExpenses} linked expense${linkedExpenses===1?'':'s'}.`:'';
  if(!confirm(`Delete the budget for “${project.website_name}”?${expenseMessage}`))return;
  button.disabled=true;$('#finance-status').textContent='Deleting website budget...';
  const {error}=await db.from('finance_projects').delete().eq('id',project.id);
  if(error){$('#finance-status').textContent=explainFinanceError(error,'website budget');button.disabled=false;return;}
  await loadFinance();
  $('#finance-status').textContent=`Deleted the budget for ${project.website_name}.`;
}

async function saveFinanceProject(event){
  event.preventDefault();
  const form=event.currentTarget;const button=form.querySelector('button');const values=Object.fromEntries(new FormData(form));
  button.disabled=true;$('#finance-project-status').textContent='Saving website budget...';
  const {error}=await db.from('finance_projects').insert({website_name:values.website_name.trim(),total_budget:Number(values.total_budget)});
  if(error){$('#finance-project-status').textContent=explainFinanceError(error,'website budget');button.disabled=false;return;}
  form.reset();$('#finance-project-status').textContent='Website budget saved.';button.disabled=false;await loadFinance();
}

async function saveExpense(event){
  event.preventDefault();
  const form=event.currentTarget;const button=form.querySelector('button');const values=Object.fromEntries(new FormData(form));
  button.disabled=true;$('#finance-expense-status').textContent='Saving expense...';
  const {error}=await db.from('website_expenses').insert({finance_project_id:values.finance_project_id,category:values.category,amount:Number(values.amount),spent_on:values.spent_on,description:values.description.trim()});
  if(error){$('#finance-expense-status').textContent=explainFinanceError(error,'expense');button.disabled=false;return;}
  form.reset();setToday(form.elements.spent_on);$('#finance-expense-status').textContent='Expense saved and profit recalculated.';button.disabled=false;await loadFinance();
}

function setToday(input){
  const now=new Date();
  input.value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
function explainFinanceError(error,item){
  const message=String(error?.message||'');
  if(error?.code==='PGRST205'||error?.code==='42P01'||/could not find the table|relation .* does not exist/i.test(message))return 'The finance database tables are missing. Run the complete latest supabase-schema.sql in Supabase SQL Editor, then refresh.';
  if(error?.code==='42501'||/row-level security|permission denied/i.test(message))return 'Supabase blocked this save. Confirm this signed-in user is listed in public.admin_users, then refresh.';
  return `Could not save the ${item}${error?.code?` (${error.code})`:''}: ${message||'check the finance schema and admin access.'}`;
}
setToday($('#finance-expense-form').elements.spent_on);
