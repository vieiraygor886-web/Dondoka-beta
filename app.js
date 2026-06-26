import { db } from "./firebase-config.js";
import {
  collection, query, where, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const CONFIG = {
  SENHA_KEY: "dondoka_senha",
  SENHA_PADRAO: "1270",
  SALAO_MAPS: "https://maps.google.com/?q=Rua+Azevedo+Soares+1270+Tatuapé+São+Paulo",
  PROF: { filipe: "Filipe", roseli: "Roseli" }
};

const COLECAO = "agendamentos";
const COL_FIN = "financeiro";
const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const DIAS_A = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const DIAS_C = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];

// ============================================================
// ESTADO
// ============================================================
const E = {
  prof: null, dataSel: hojeLocal(), inicioSem: null,
  mesAtual: null, visao: "semana",
  ags: [], cancelarAg: null, busca: "", idEdit: null,
  abatual: "agenda",
  filtroResumo: "hoje",
  finVisao: "dia", finMesAtual: null,
  agWA: null
};

function g(id) { return document.getElementById(id); }

// ============================================================
// SENHA
// ============================================================
function getSenha() { return localStorage.getItem(CONFIG.SENHA_KEY) || CONFIG.SENHA_PADRAO; }
function setSenha(s) { localStorage.setItem(CONFIG.SENHA_KEY, s); }

// ============================================================
// DATAS
// ============================================================
function hojeLocal() { const a=new Date(); return new Date(a.getFullYear(),a.getMonth(),a.getDate()); }
function mesmaData(a,b) { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function toISO(d) { return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
function fromISO(s) { var p=s.split("-").map(Number); return new Date(p[0],p[1]-1,p[2]); }
function pad(n) { return String(n).padStart(2,"0"); }
function addDias(d,n) { var c=new Date(d); c.setDate(c.getDate()+n); return c; }
function inicioSem(d) { var c=new Date(d); c.setDate(c.getDate()-c.getDay()); return c; }
function fmtData(d) { return pad(d.getDate())+"/"+pad(d.getMonth()+1)+"/"+d.getFullYear(); }
function fmtDataCurta(d) { return d.getDate()+" de "+MESES[d.getMonth()]; }
function saudacao() {
  var h=new Date().getHours();
  if(h<12) return "Bom dia";
  if(h<18) return "Boa tarde";
  return "Boa noite";
}
function moeda(v) { return "R$ "+parseFloat(v||0).toFixed(2).replace(".",","); }

// ============================================================
// SPLASH → LOGIN
// ============================================================
window.addEventListener("load", function() {
  setTimeout(function() {
    var s=g("splash");
    s.classList.add("saindo");
    setTimeout(function() {
      s.hidden=true;
      g("tela-login").hidden=false;
    }, 600);
  }, 2000);
});

// ============================================================
// LOGIN
// ============================================================
// Esconder tudo exceto login ao iniciar
function esconderTudo() {
  g("tela-profissional").style.display = "none";
  g("app").style.display = "none";
  g("tela-login").style.display = "flex";
}

esconderTudo();

g("btn-entrar").addEventListener("click", tentarLogin);
g("login-senha").addEventListener("keydown", function(e){ if(e.key==="Enter") tentarLogin(); });

function tentarLogin() {
  var senha = g("login-senha").value.trim();
  if(senha === getSenha()) {
    g("tela-login").style.display = "none";
    g("tela-profissional").style.display = "flex";
    g("app").style.display = "none";
    g("login-senha").value = "";
    g("login-erro").hidden = true;
  } else {
    g("login-erro").hidden = false;
    g("login-senha").value = "";
    g("login-senha").focus();
  }
}

// ============================================================
// SELEÇÃO DE PROFISSIONAL
// ============================================================
document.querySelectorAll(".prof-card").forEach(function(b){
  b.addEventListener("click", function(){ entrarComoProf(b.dataset.prof); });
});

g("btn-sair").addEventListener("click", function(){
  g("tela-profissional").style.display="none";
  g("tela-login").style.display="flex";
});

function entrarComoProf(prof) {
  E.prof=prof;
  E.dataSel=hojeLocal();
  E.inicioSem=inicioSem(E.dataSel);
  E.mesAtual={a:E.dataSel.getFullYear(),m:E.dataSel.getMonth()};
  E.finMesAtual={a:E.dataSel.getFullYear(),m:E.dataSel.getMonth()};
  g("tela-profissional").style.display="none";
  g("app").style.display="flex";
  atualizarHeader();
  ouvirAgs(prof);
  desenharCal();
  renderLista();
  atualizarResumo();
  renderFinanceiro();
  renderClientes();
  g("fin-data").value=toISO(hojeLocal());
  calcTotalFin();
}

g("btn-trocar-prof").addEventListener("click", function(){
  fecharTodos();
  if(E.cancelarAg) E.cancelarAg();
  g("app").style.display="none";
  g("tela-profissional").style.display="flex";
  E.prof=null; E.ags=[];
});

function atualizarHeader() {
  g("header-saudacao").textContent=saudacao()+", "+CONFIG.PROF[E.prof]+"!";
  var hoje=hojeLocal();
  g("header-data").textContent=DIAS_C[hoje.getDay()]+", "+fmtDataCurta(hoje);
}

// ============================================================
// FIREBASE — agendamentos
// ============================================================
function ouvirAgs(prof) {
  if(E.cancelarAg) E.cancelarAg();
  setSyncIng();
  var q=query(collection(db,COLECAO),where("profissional","==",prof));
  E.cancelarAg=onSnapshot(q,
    function(snap){
      E.ags=snap.docs.map(function(d){return{id:d.id,...d.data()};});
      desenharCal(); renderLista(); atualizarResumo(); renderClientes();
      setSyncOk();
    },
    function(err){ console.error(err); toast("Sem conexão."); }
  );
}

function setSyncOk() { g("sync-indicador").className="sync-ok"; g("sync-indicador").title="Sincronizado"; }
function setSyncIng() { g("sync-indicador").className="sync-ing"; g("sync-indicador").title="Sincronizando…"; }

// ============================================================
// NAVEGAÇÃO ABAS
// ============================================================
document.querySelectorAll(".nav-btn").forEach(function(b){
  b.addEventListener("click", function(){ trocarAba(b.dataset.aba); });
});

function trocarAba(aba) {
  E.abatual=aba;
  document.querySelectorAll(".aba-conteudo").forEach(function(el){ el.hidden=true; });
  document.querySelectorAll(".nav-btn").forEach(function(b){ b.classList.toggle("ativo",b.dataset.aba===aba); });
  g("aba-"+aba).hidden=false;
  if(aba==="resumo") atualizarResumo();
  if(aba==="financeiro") renderFinanceiro();
  if(aba==="clientes") renderClientes();
}

// ============================================================
// CALENDÁRIO
// ============================================================
g("btn-vis-sem").addEventListener("click", function(){ E.visao="semana"; desenharCal(); renderLista(); });
g("btn-vis-mes").addEventListener("click", function(){ E.visao="mes"; E.mesAtual={a:E.dataSel.getFullYear(),m:E.dataSel.getMonth()}; desenharCal(); renderLista(); });
g("btn-hoje").addEventListener("click", function(){ E.dataSel=hojeLocal(); E.inicioSem=inicioSem(E.dataSel); E.mesAtual={a:E.dataSel.getFullYear(),m:E.dataSel.getMonth()}; limparBusca(); desenharCal(); renderLista(); });

g("cal-ant").addEventListener("click", function(){
  if(E.visao==="semana"){ E.inicioSem=addDias(E.inicioSem,-7); desenharSemana(); }
  else { var v=E.mesAtual,m=v.m-1,a=v.a; if(m<0){m=11;a--;} E.mesAtual={a:a,m:m}; desenharMes(); }
});
g("cal-prox").addEventListener("click", function(){
  if(E.visao==="semana"){ E.inicioSem=addDias(E.inicioSem,7); desenharSemana(); }
  else { var v=E.mesAtual,m=v.m+1,a=v.a; if(m>11){m=0;a++;} E.mesAtual={a:a,m:m}; desenharMes(); }
});

function desenharCal() {
  var sem=E.visao==="semana";
  g("btn-vis-sem").classList.toggle("ativo",sem);
  g("btn-vis-mes").classList.toggle("ativo",!sem);
  g("cal-dias").hidden=!sem;
  g("cal-grade-mes").hidden=sem;
  if(sem) desenharSemana(); else desenharMes();
}

function desenharSemana() {
  var hoje=hojeLocal(), fim=addDias(E.inicioSem,6);
  g("cal-rotulo").textContent=
    E.inicioSem.getMonth()===fim.getMonth()
      ? E.inicioSem.getDate()+" a "+fim.getDate()+" de "+MESES[fim.getMonth()]
      : E.inicioSem.getDate()+" de "+MESES[E.inicioSem.getMonth()]+" a "+fim.getDate()+" de "+MESES[fim.getMonth()];
  g("cal-dias").innerHTML="";
  for(var i=0;i<7;i++){
    (function(i){
      var d=addDias(E.inicioSem,i), temAg=E.ags.some(function(a){return a.data===toISO(d);});
      var p=document.createElement("button"); p.type="button"; p.className="dia-pill";
      if(mesmaData(d,hoje)) p.classList.add("hoje");
      if(mesmaData(d,E.dataSel)&&!E.busca) p.classList.add("sel");
      p.innerHTML='<span class="dia-pill-ab">'+DIAS_A[d.getDay()]+'</span><span class="dia-pill-num">'+d.getDate()+'</span>'+(temAg?'<span class="dia-pill-dot"></span>':"");
      p.addEventListener("click",function(){ E.dataSel=d; limparBusca(); desenharSemana(); renderLista(); });
      g("cal-dias").appendChild(p);
    })(i);
  }
}

function desenharMes() {
  var a=E.mesAtual.a, m=E.mesAtual.m, hoje=hojeLocal();
  g("cal-rotulo").textContent=MESES[m].charAt(0).toUpperCase()+MESES[m].slice(1)+" "+a;
  g("cal-grade-mes").innerHTML="";
  var cab=document.createElement("div"); cab.className="mes-cab";
  DIAS_A.forEach(function(d){var s=document.createElement("span");s.textContent=d;cab.appendChild(s);});
  g("cal-grade-mes").appendChild(cab);
  var gr=document.createElement("div"); gr.className="mes-grade";
  var prim=new Date(a,m,1), ult=new Date(a,m+1,0).getDate(), off=prim.getDay();
  for(var i=0;i<off;i++) gr.appendChild(celMes(new Date(a,m,1-(off-i)),true,hoje));
  for(var i=1;i<=ult;i++) gr.appendChild(celMes(new Date(a,m,i),false,hoje));
  var r=(off+ult)%7===0?0:7-(off+ult)%7;
  for(var i=1;i<=r;i++) gr.appendChild(celMes(new Date(a,m+1,i),true,hoje));
  g("cal-grade-mes").appendChild(gr);
}

function celMes(d,outro,hoje) {
  var temAg=E.ags.some(function(a){return a.data===toISO(d);});
  var c=document.createElement("div"); c.className="mes-cel";
  if(outro) c.classList.add("outro");
  if(mesmaData(d,hoje)) c.classList.add("hoje-m");
  if(mesmaData(d,E.dataSel)&&!E.busca) c.classList.add("sel-m");
  c.textContent=d.getDate();
  if(temAg){var p=document.createElement("span");p.className="dot";c.appendChild(p);}
  c.addEventListener("click",function(){ E.dataSel=d; E.mesAtual={a:d.getFullYear(),m:d.getMonth()}; limparBusca(); desenharMes(); renderLista(); });
  return c;
}

// ============================================================
// BUSCA
// ============================================================
g("campo-busca").addEventListener("input",function(){
  E.busca=g("campo-busca").value.trim();
  g("btn-limpar-busca").hidden=E.busca.length===0;
  desenharCal(); renderLista();
});
g("btn-limpar-busca").addEventListener("click",function(){ limparBusca(); desenharCal(); renderLista(); });
function limparBusca(){ E.busca=""; g("campo-busca").value=""; g("btn-limpar-busca").hidden=true; }
function norm(t){ return (t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""); }

// ============================================================
// LISTA DE AGENDAMENTOS
// ============================================================
function renderLista() {
  var lista, mostrarData=false;
  if(E.busca){
    g("bloco-semana") && (g("bloco-semana") ? g("bloco-semana").style.display="none" : null);
    var t=norm(E.busca);
    lista=E.ags.filter(function(a){return norm(a.cliente).includes(t);}).sort(function(a,b){return (a.data+a.horario).localeCompare(b.data+b.horario);});
    g("lista-titulo").textContent='Resultados para "'+E.busca+'"';
    mostrarData=true;
  } else {
    var bs=document.querySelector(".cal-bloco");
    if(bs) bs.style.display="";
    var iso=toISO(E.dataSel);
    lista=E.ags.filter(function(a){return a.data===iso;}).sort(function(a,b){return a.horario.localeCompare(b.horario);});
    var hoje=hojeLocal();
    var pre=mesmaData(E.dataSel,hoje)?"Hoje, ":"";
    g("lista-titulo").textContent=pre+DIAS_C[E.dataSel.getDay()]+", "+fmtDataCurta(E.dataSel);
  }
  renderCartoes(lista,mostrarData);
}

function visitsDoMes(cliente,mesISO){
  return E.ags.filter(function(a){return a.cliente===cliente&&a.visitaPacote&&a.data&&a.data.slice(0,7)===mesISO;})
    .sort(function(a,b){return a.data.localeCompare(b.data);});
}

function renderCartoes(lista, mostrarData) {
  var el=g("lista-ags");
  el.innerHTML="";
  if(!lista.length){
    g("lista-vazio").hidden=false;
    g("lista-vazio").querySelector("p").textContent=E.busca?"Nenhuma cliente encontrada.":"Nenhum agendamento para este dia.";
    return;
  }
  g("lista-vazio").hidden=true;

  lista.forEach(function(ag){
    var c=document.createElement("div"); c.className="cartao prof-"+E.prof;
    var sub=[], mesISO=ag.data?ag.data.slice(0,7):toISO(E.dataSel).slice(0,7);
    if(ag.servico) sub.push(ag.servico);
    if(ag.telefone) sub.push(ag.telefone);

    var badges="";
    if(ag.temPacote){
      var visits=visitsDoMes(ag.cliente,mesISO);
      var n=visits.length, total=parseInt(ag.pacoteTotal)||4;
      var dias=visits.map(function(v){return fromISO(v.data).getDate();}).join(", ");
      badges+='<span class="badge badge-pacote">Pacote '+n+"/"+total+(n>0?" · dias "+dias:"")+"</span>";
    }
    if(mostrarData&&ag.data) badges+='<span class="badge badge-data">'+fmtDataCurta(fromISO(ag.data))+"</span>";
    if(ag.presencaConfirmada) badges+='<span class="badge badge-pres">Presente ✓</span>';

    c.innerHTML=
      '<div class="cartao-barra"></div>'+
      '<div class="cartao-inner">'+
        '<div class="cartao-hora"><span>'+ag.horario+'</span></div>'+
        '<div class="cartao-corpo">'+
          '<div class="cartao-nome">'+esc(ag.cliente)+'</div>'+
          (sub.length?'<div class="cartao-sub">'+esc(sub.join(" · "))+'</div>':'')+
          (ag.observacao?'<div class="cartao-sub">'+esc(ag.observacao)+'</div>':'')+
          (badges?'<div class="cartao-badges">'+badges+'</div>':'')+
        '</div>'+
        '<div class="cartao-acoes">'+
          '<button class="btn-ac ed" type="button">✏️</button>'+
          (ag.telefone?'<button class="btn-ac wa" type="button"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg></button>':'')+
          '<button class="btn-ac ok'+(ag.presencaConfirmada?" ativo":"")+'" type="button">'+(ag.presencaConfirmada?"✓":"ok")+'</button>'+
          '<button class="btn-ac dl" type="button">🗑</button>'+
        '</div>'+
      '</div>';

    c.querySelector(".ed").addEventListener("click",function(e){e.stopPropagation();editarAg(ag);});
    c.querySelector(".dl").addEventListener("click",function(e){e.stopPropagation();confirmarExcluir(ag);});
    if(ag.telefone) c.querySelector(".wa").addEventListener("click",function(e){e.stopPropagation();abrirWA(ag);});
    c.querySelector(".ok").addEventListener("click",function(e){
      e.stopPropagation();
      updateDoc(doc(db,COLECAO,ag.id),{presencaConfirmada:!ag.presencaConfirmada})
        .then(function(){toast(ag.presencaConfirmada?"Desmarcado":"Presença confirmada ✓");})
        .catch(function(){toast("Erro ao atualizar.");});
    });
    c.addEventListener("click",function(){verHistorico(ag.cliente);});
    el.appendChild(c);
  });
}

function esc(t){var d=document.createElement("div");d.textContent=t||"";return d.innerHTML;}

// ============================================================
// WHATSAPP
// ============================================================
function abrirWA(ag) {
  E.agWA=ag;
  var d=fromISO(ag.data);
  var msg="Olá! Tudo bem?\n\nPassando para confirmar seu agendamento para o dia "+fmtDataCurta(d)+", às "+ag.horario+", com "+CONFIG.PROF[E.prof]+".\n\nQualquer imprevisto, por favor, nos avise.\n\nAguardamos você! 💛";
  g("wa-preview").textContent=msg;
  g("wa-localizacao").checked=false;
  abrirPainel("painel-wa");
}

g("btn-cancelar-wa").addEventListener("click",function(){fecharPainel("painel-wa");});
g("fundo-wa").addEventListener("click",function(){fecharPainel("painel-wa");});

g("btn-enviar-wa").addEventListener("click",function(){
  var ag=E.agWA; if(!ag) return;
  var tel=(ag.telefone||"").replace(/\D/g,"");
  if(tel.length<=11) tel="55"+tel;
  var d=fromISO(ag.data);
  var msg="Olá! Tudo bem?\n\nPassando para confirmar seu agendamento para o dia "+fmtDataCurta(d)+", às "+ag.horario+", com "+CONFIG.PROF[E.prof]+".\n\nQualquer imprevisto, por favor, nos avise.\n\nAguardamos você! 💛";
  if(g("wa-localizacao").checked) msg+="\n\n📍 Como nos encontrar: "+CONFIG.SALAO_MAPS;
  fecharPainel("painel-wa");
  window.location.href="https://api.whatsapp.com/send?phone="+tel+"&text="+encodeURIComponent(msg);
});

// ============================================================
// HISTÓRICO
// ============================================================
function verHistorico(nomeCliente) {
  g("hist-titulo").textContent=nomeCliente;
  var todos=E.ags.filter(function(a){return a.cliente===nomeCliente;}).sort(function(a,b){return b.data.localeCompare(a.data);});
  if(!todos.length){toast("Nenhum histórico encontrado.");return;}
  var meses={};
  todos.forEach(function(a){var k=a.data.slice(0,7);if(!meses[k])meses[k]=[];meses[k].push(a);});
  var html="";
  Object.keys(meses).sort(function(a,b){return b.localeCompare(a);}).forEach(function(k){
    var p=k.split("-"); var titulo=MESES[parseInt(p[1])-1]+" de "+p[0];
    html+='<div class="hist-mes"><div class="hist-mes-titulo">'+titulo+'</div>';
    meses[k].forEach(function(a){
      var d=fromISO(a.data);
      html+='<div class="hist-item"><span class="hist-data">'+pad(d.getDate())+"/"+pad(d.getMonth()+1)+" "+a.horario+'</span><span class="hist-serv">'+(a.servico||"—")+'</span>'+(a.visitaPacote?'<span class="hist-badge">Pacote</span>':'')+'</div>';
    });
    html+='</div>';
  });
  g("hist-conteudo").innerHTML=html;
  abrirPainel("painel-historico");
}

g("btn-fechar-hist").addEventListener("click",function(){fecharPainel("painel-historico");});
g("fundo-historico").addEventListener("click",function(){fecharPainel("painel-historico");});

// ============================================================
// FORMULÁRIO AGENDAMENTO
// ============================================================
var timerTel=null;
g("f-telefone").addEventListener("input",function(){
  clearTimeout(timerTel);
  timerTel=setTimeout(function(){
    var tel=g("f-telefone").value.replace(/\D/g,"");
    if(tel.length<8){g("cliente-identificado").hidden=true;return;}
    var match=E.ags.find(function(a){return a.telefone&&a.telefone.replace(/\D/g,"")===tel;});
    if(match){
      if(!g("f-cliente").value.trim()) g("f-cliente").value=match.cliente;
      if(match.temPacote){g("f-tem-pacote").checked=true;g("f-secao-pacote").hidden=false;g("f-pacote-desc").value=match.pacoteDesc||"";g("f-pacote-total").value=match.pacoteTotal||4;}
      var mesISO=toISO(E.dataSel).slice(0,7);
      var visits=visitsDoMes(match.cliente,mesISO);
      var n=visits.length, total=parseInt(match.pacoteTotal)||4;
      var sub=match.temPacote?"Pacote: "+n+"/"+total+" visitas este mês"+(n>0?" · dias "+visits.map(function(v){return fromISO(v.data).getDate();}).join(", "):""):"Cliente encontrada";
      g("cliente-avatar-letra").textContent=match.cliente.charAt(0).toUpperCase();
      g("cliente-id-nome").textContent=match.cliente;
      g("cliente-id-sub").textContent=sub;
      g("cliente-identificado").hidden=false;
    } else {
      g("cliente-identificado").hidden=true;
    }
  },500);
});

g("btn-ver-historico").addEventListener("click",function(){
  var nome=g("f-cliente").value.trim();
  if(nome){fecharPainel("painel-form");setTimeout(function(){verHistorico(nome);},200);}
});

g("f-tem-pacote").addEventListener("change",function(){g("f-secao-pacote").hidden=!g("f-tem-pacote").checked;});

g("btn-novo-ag").addEventListener("click",function(){
  E.idEdit=null;
  g("form-titulo").textContent="Novo agendamento";
  g("form-ag").reset();
  g("f-data").value=toISO(E.dataSel);
  g("f-secao-pacote").hidden=true;
  g("cliente-identificado").hidden=true;
  g("btn-excluir-form").hidden=true;
  abrirPainel("painel-form");
  setTimeout(function(){g("f-telefone").focus();},250);
});

function editarAg(ag){
  E.idEdit=ag.id;
  g("form-titulo").textContent="Editar agendamento";
  g("f-data").value=ag.data; g("f-horario").value=ag.horario;
  g("f-cliente").value=ag.cliente||""; g("f-telefone").value=ag.telefone||"";
  g("f-servico").value=ag.servico||"";
  g("f-tem-pacote").checked=!!ag.temPacote;
  g("f-pacote-desc").value=ag.pacoteDesc||"";
  g("f-pacote-total").value=ag.pacoteTotal||4;
  g("f-visita-pacote").checked=!!ag.visitaPacote;
  g("f-secao-pacote").hidden=!ag.temPacote;
  g("f-obs").value=ag.observacao||"";
  g("btn-excluir-form").hidden=false;
  g("cliente-identificado").hidden=true;
  abrirPainel("painel-form");
}

g("btn-fechar-form").addEventListener("click",function(){fecharPainel("painel-form");});
g("btn-cancelar-form").addEventListener("click",function(){fecharPainel("painel-form");});
g("fundo-form").addEventListener("click",function(){fecharPainel("painel-form");});

g("form-ag").addEventListener("submit",function(e){
  e.preventDefault();
  var dados={
    profissional:E.prof, data:g("f-data").value, horario:g("f-horario").value,
    cliente:g("f-cliente").value.trim(), telefone:g("f-telefone").value.trim(),
    servico:g("f-servico").value.trim(),
    temPacote:g("f-tem-pacote").checked,
    pacoteDesc:g("f-tem-pacote").checked?g("f-pacote-desc").value.trim():"",
    pacoteTotal:g("f-tem-pacote").checked?parseInt(g("f-pacote-total").value)||4:0,
    visitaPacote:g("f-tem-pacote").checked?g("f-visita-pacote").checked:false,
    observacao:g("f-obs").value.trim()
  };
  if(!dados.cliente||!dados.data||!dados.horario){toast("Preencha data, horário e nome.");return;}
  var btn=g("form-ag").querySelector(".btn-primario");
  btn.disabled=true; btn.textContent="Salvando…";
  var p;
  if(E.idEdit) p=updateDoc(doc(db,COLECAO,E.idEdit),dados);
  else{dados.criadoEm=serverTimestamp();dados.presencaConfirmada=false;p=addDoc(collection(db,COLECAO),dados);}
  p.then(function(){toast(E.idEdit?"Atualizado ✓":"Agendamento salvo ✓");fecharPainel("painel-form");})
   .catch(function(err){console.error(err);toast("Erro ao salvar.");})
   .finally(function(){btn.disabled=false;btn.textContent="Salvar";});
});

g("btn-excluir-form").addEventListener("click",function(){
  var ag=E.ags.find(function(a){return a.id===E.idEdit;});
  if(ag){fecharPainel("painel-form");setTimeout(function(){confirmarExcluir(ag);},200);}
});

// ============================================================
// EXCLUSÃO
// ============================================================
var idExcluir=null;

function confirmarExcluir(ag){
  idExcluir=ag.id;
  g("confirmar-texto").textContent="Excluir o agendamento de "+ag.cliente+" às "+ag.horario+"? Esta ação não pode ser desfeita.";
  abrirPainel("painel-confirmar");
}

g("btn-cancelar-ex").addEventListener("click",function(){idExcluir=null;fecharPainel("painel-confirmar");});
g("fundo-confirmar").addEventListener("click",function(){idExcluir=null;fecharPainel("painel-confirmar");});

g("btn-confirmar-ex").addEventListener("click",function(){
  if(!idExcluir) return;
  var id=idExcluir; idExcluir=null;
  fecharPainel("painel-confirmar");
  deleteDoc(doc(db,COLECAO,id)).then(function(){toast("Excluído");}).catch(function(){toast("Erro ao excluir.");});
});

// ============================================================
// RESUMO
// ============================================================
document.querySelectorAll(".filtro-btn").forEach(function(b){
  b.addEventListener("click",function(){
    document.querySelectorAll(".filtro-btn").forEach(function(x){x.classList.remove("ativo");});
    b.classList.add("ativo"); E.filtroResumo=b.dataset.filtro; atualizarResumo();
  });
});

function atualizarResumo(){
  var hoje=hojeLocal(), iso=toISO(hoje);
  var filtrados=E.ags.filter(function(ag){
    if(!ag.data) return false;
    if(E.filtroResumo==="hoje") return ag.data===iso;
    if(E.filtroResumo==="semana"){ var ini=inicioSem(hoje); return ag.data>=toISO(ini)&&ag.data<=toISO(addDias(ini,6)); }
    if(E.filtroResumo==="mes") return ag.data.slice(0,7)===iso.slice(0,7);
    return true;
  });
  var total=filtrados.length;
  var presentes=filtrados.filter(function(a){return a.presencaConfirmada;}).length;
  var pacotes=filtrados.filter(function(a){return a.temPacote;}).length;
  var html='<div class="resumo-card"><h4>Atendimentos</h4>'+
    '<div class="resumo-stat"><span class="resumo-stat-label">Total agendado</span><span class="resumo-stat-valor">'+total+'</span></div>'+
    '<div class="resumo-stat"><span class="resumo-stat-label">Confirmados</span><span class="resumo-stat-valor">'+presentes+'</span></div>'+
    '<div class="resumo-stat"><span class="resumo-stat-label">Com pacote</span><span class="resumo-stat-valor">'+pacotes+'</span></div>'+
    '</div>';
  // Serviços mais comuns
  var servs={};
  filtrados.forEach(function(a){if(a.servico){var k=a.servico.trim();servs[k]=(servs[k]||0)+1;}});
  var top=Object.entries(servs).sort(function(a,b){return b[1]-a[1];}).slice(0,5);
  if(top.length){
    html+='<div class="resumo-card"><h4>Serviços</h4>';
    top.forEach(function(s){html+='<div class="resumo-stat"><span class="resumo-stat-label">'+esc(s[0])+'</span><span class="resumo-stat-valor">'+s[1]+'x</span></div>';});
    html+='</div>';
  }
  g("resumo-conteudo").innerHTML=html;
}

// ============================================================
// FINANCEIRO
// ============================================================
document.querySelectorAll(".fin-tab").forEach(function(b){
  b.addEventListener("click",function(){
    document.querySelectorAll(".fin-tab").forEach(function(x){x.classList.remove("ativo");});
    b.classList.add("ativo"); E.finVisao=b.dataset.fin;
    g("fin-dia-conteudo").hidden=E.finVisao!=="dia";
    g("fin-mes-conteudo").hidden=E.finVisao!=="mes";
    if(E.finVisao==="mes") renderFinMes();
  });
});

["fin-dinheiro","fin-pix","fin-debito","fin-credito","fin-parcelado"].forEach(function(id){
  g(id).addEventListener("input",calcTotalFin);
});

function calcTotalFin(){
  var ids=["fin-dinheiro","fin-pix","fin-debito","fin-credito","fin-parcelado"];
  var total=ids.reduce(function(s,id){return s+parseFloat(g(id).value||0);},0);
  g("fin-total").textContent=moeda(total);
}

g("btn-salvar-fin").addEventListener("click",async function(){
  var data=g("fin-data").value;
  if(!data){toast("Selecione uma data.");return;}
  var dados={
    data:data, profissional:E.prof,
    dinheiro:parseFloat(g("fin-dinheiro").value||0),
    pix:parseFloat(g("fin-pix").value||0),
    debito:parseFloat(g("fin-debito").value||0),
    credito:parseFloat(g("fin-credito").value||0),
    parcelado:parseFloat(g("fin-parcelado").value||0),
    atualizadoEm:serverTimestamp()
  };
  try{
    await setDoc(doc(db,COL_FIN,E.prof+"_"+data),dados);
    toast("Financeiro salvo ✓");
  }catch(err){console.error(err);toast("Erro ao salvar financeiro.");}
});

function renderFinanceiro(){
  if(E.finVisao==="mes") renderFinMes();
}

async function renderFinMes(){
  var a=E.finMesAtual.a, m=E.finMesAtual.m;
  var html='<div class="fin-mes-cab"><button id="fin-mes-ant" type="button">‹</button><span>'+MESES[m].charAt(0).toUpperCase()+MESES[m].slice(1)+" "+a+'</span><button id="fin-mes-prox" type="button">›</button></div>';
  html+='<div class="fin-grade" id="fin-grade-dias"></div>';
  g("fin-mes-grade").innerHTML=html;

  g("fin-mes-ant").addEventListener("click",function(){ var v=E.finMesAtual,mm=v.m-1,aa=v.a; if(mm<0){mm=11;aa--;} E.finMesAtual={a:aa,m:mm}; renderFinMes(); });
  g("fin-mes-prox").addEventListener("click",function(){ var v=E.finMesAtual,mm=v.m+1,aa=v.a; if(mm>11){mm=0;aa++;} E.finMesAtual={a:aa,m:mm}; renderFinMes(); });

  var ult=new Date(a,m+1,0).getDate();
  var grade=g("fin-grade-dias");
  for(var i=1;i<=ult;i++){
    var cel=document.createElement("div"); cel.className="fin-dia-cel vazio";
    cel.textContent=i;
    grade.appendChild(cel);
  }
  g("fin-mes-resumo").innerHTML='<div style="text-align:center;color:var(--texto-leve);padding:1rem;font-size:.85rem">Carregando…</div>';
}

// ============================================================
// CLIENTES
// ============================================================
g("busca-cliente").addEventListener("input",function(){ renderClientes(g("busca-cliente").value.trim()); });

function renderClientes(filtro){
  var clientes={};
  E.ags.forEach(function(ag){
    if(!ag.cliente) return;
    if(!clientes[ag.cliente]) clientes[ag.cliente]={nome:ag.cliente,telefone:ag.telefone||"",total:0,ultima:""};
    clientes[ag.cliente].total++;
    if(!clientes[ag.cliente].ultima||ag.data>clientes[ag.cliente].ultima) clientes[ag.cliente].ultima=ag.data;
  });
  var lista=Object.values(clientes);
  if(filtro) lista=lista.filter(function(c){return norm(c.nome).includes(norm(filtro));});
  lista.sort(function(a,b){return a.nome.localeCompare(b.nome);});
  var el=g("lista-clientes"); el.innerHTML="";
  if(!lista.length){el.innerHTML='<p style="text-align:center;padding:2rem;color:var(--texto-leve)">Nenhuma cliente encontrada.</p>';return;}
  lista.forEach(function(c){
    var item=document.createElement("div"); item.className="cliente-item";
    item.innerHTML='<div class="cliente-av">'+c.nome.charAt(0).toUpperCase()+'</div><div class="cliente-info"><div class="cliente-nome">'+esc(c.nome)+'</div><div class="cliente-sub">'+(c.telefone||"Sem telefone")+" · "+c.total+" visita"+(c.total!==1?"s":"")+(c.ultima?" · última: "+fmtData(fromISO(c.ultima)):"")+'</div></div>';
    item.addEventListener("click",function(){verHistorico(c.nome);});
    el.appendChild(item);
  });
}

// ============================================================
// CONFIGURAÇÕES — TROCAR SENHA
// ============================================================
g("btn-trocar-senha").addEventListener("click",function(){
  g("senha-atual").value=""; g("senha-nova").value=""; g("senha-confirmar").value="";
  g("senha-erro").hidden=true;
  abrirPainel("painel-senha");
});
g("btn-fechar-senha").addEventListener("click",function(){fecharPainel("painel-senha");});
g("fundo-senha").addEventListener("click",function(){fecharPainel("painel-senha");});

g("btn-salvar-senha").addEventListener("click",function(){
  var atual=g("senha-atual").value, nova=g("senha-nova").value, conf=g("senha-confirmar").value;
  if(atual!==getSenha()){g("senha-erro").textContent="Senha atual incorreta.";g("senha-erro").hidden=false;return;}
  if(!nova||nova.length<4){g("senha-erro").textContent="A nova senha deve ter ao menos 4 dígitos.";g("senha-erro").hidden=false;return;}
  if(nova!==conf){g("senha-erro").textContent="As senhas não coincidem.";g("senha-erro").hidden=false;return;}
  setSenha(nova);
  fecharPainel("painel-senha");
  toast("Senha alterada com sucesso ✓");
});

// ============================================================
// PAINÉIS
// ============================================================
function abrirPainel(id){
  ["painel-form","painel-confirmar","painel-historico","painel-wa","painel-senha"].forEach(function(p){
    if(p!==id) g(p).hidden=true;
  });
  g(id).hidden=false;
}
function fecharPainel(id){ g(id).hidden=true; }
function fecharTodos(){ ["painel-form","painel-confirmar","painel-historico","painel-wa","painel-senha"].forEach(function(p){g(p).hidden=true;}); }

// ============================================================
// TOAST
// ============================================================
var timerToast=null;
function toast(msg){
  g("toast").textContent=msg; g("toast").classList.add("mostrar");
  clearTimeout(timerToast);
  timerToast=setTimeout(function(){g("toast").classList.remove("mostrar");},3200);
}
