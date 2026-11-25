import { BODY_RADIUS, PULL_RADIUS, dragRotationDelta } from "../src/utils/mallangMotion";
import { MATERIAL } from "../src/utils/mallangMaterial";
// Development-only test entry. Vite's production entry never imports this file.
import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import MallangPage from "../src/pages/MallangPage";
import { installButtonRipple } from "../src/utils/buttonRipple";
import "../src/index.css";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const next = () => new Promise(requestAnimationFrame);
const inspect = () => window.__mallangInspect();
const snapshot = () => {
  const state=inspect(),last=state.records.at(-1),cost=state.costs.slice().sort((a,b)=>a-b);
  return {active:state.active,frames:state.frames,last,
    p95:cost[Math.floor(cost.length*.95)]??0};
};
async function run(name,setRunning,setReport) {
    setRunning(true);setReport({name,status:"running"});await next();
    const body=document.querySelector(".mallang-body"),rect=body.closest(".mallang-character").getBoundingClientRect();
    const originalCapture=body.setPointerCapture;
    // DOM-injected touch tests cannot acquire native pointer capture. Native CUA
    // clicks/drags test real capture separately on /mallang.
    body.setPointerCapture=()=>{};
    const send=(type,x=100,y=100)=>body.dispatchEvent(new PointerEvent(type,{
      bubbles:true,cancelable:true,isPrimary:true,pointerId:101,pointerType:"touch",button:0,
      buttons:type==="pointerup"||type==="pointercancel"?0:1,
      clientX:rect.left+x/200*rect.width,clientY:rect.top+y/200*rect.height,pressure:.5}));
    const before=snapshot();const started=performance.now();
    let checks={};
    try {
      if(name==="rim-transition") {
        const stage=(phase)=>setReport({name,status:"running",phase,state:snapshot()});
        send("pointerdown",100,100);await wait(1200);stage("central hold");
        for(let i=1;i<=225;i++){send("pointermove",100+i*.4,100);await wait(20);}
        stage("rim hold");await wait(1800);
        const held=inspect().records.at(-1);
        for(let i=1;i<=150;i++) {
          const angle=Math.sin(i/45)*.55;
          send("pointermove",100+Math.cos(angle)*90,100+Math.sin(angle)*90);await wait(20);
        }
        stage("rim reversal");await wait(1200);
        let insideFixed=false,earlyTip=false;
        for(let i=1;i<=85;i++){
          send("pointermove",190+i*.45,100);await wait(20);
          if(i===37) {
            const stillInside=inspect().records.at(-1);
            insideFixed=stillInside.x===held.x&&stillInside.y===held.y;
            earlyTip=stillInside.tip?.radius>0&&stillInside.tip.blend<1;
          }
        }
        stage("outside pull");const pulled=inspect().records.slice(-80);
        send("pointerup",228,100);await wait(3600);
        checks={deepRim:held.depth>.8,indented:held.contactHeight<-8,
          directional:held.rimAtContact>103&&held.rimOpposite===94,
          balanced:Math.abs(held.signedHeight)<.05,insideFixed,earlyTip,
          pull:pulled.some(s=>s.tip?.radius>PULL_RADIUS*.5)&&pulled.some(s=>s.vx>0),restored:!snapshot().active};
      }
      if(name==="hold"||name==="edge") {
        const x=name==="edge"?188:100;
        send("pointerdown",x,100);await wait(2100);
        const held=inspect().records.at(-1);
        send("pointerup");await wait(3400);
        const after=snapshot();
        checks={deep:name==="edge"?held.displaced>1000:held.center<-10,balanced:Math.abs(held.raised-held.displaced)<.05,
          restored:!after.active&&Math.abs(after.last.center)<.01,finite:held.energy<5};
      }
      if(name==="rub"||name==="turn") {
        send("pointerdown",60,100);await wait(800);
        const steps=name==="rub"?55:95;
        for(let i=0;i<steps;i++) {
          const x=name==="rub"?60+i*1.5:100+Math.sin(i*.25)*48;
          const y=name==="rub"?100+Math.sin(i*.14)*18:100+Math.sin(i*.5)*35;
          send("pointermove",x,y);await wait(18);
        }
        const moving=inspect().records.slice(-60);
        send("pointerup",142,100);await wait(3500);
        checks={pressure:moving.every((s)=>s.depth>.85),fixedCenter:moving.every((s)=>s.x===moving[0].x&&s.y===moving[0].y),
          bounded:moving.every((s)=>s.trail<=MATERIAL.maxTrail&&Number.isFinite(s.center)),
          recoveringTrail:moving.some((s)=>s.trail>1),balanced:moving.every((s)=>Math.abs(s.raised-s.displaced)<.05),restored:!snapshot().active};
      }
      if(name==="spin") {
        const center = { x: 100, y: 100 };
        let from = { x: 174, y: 75 }, draggedAngle = 0;
        send("pointerdown", from.x, from.y);
        await next();
        const held = snapshot().last;
        for (let y = 85; y <= 125; y += 10) {
          const to = { x: 174, y };
          send("pointermove", to.x, to.y);
          draggedAngle += dragRotationDelta(from, to, center, BODY_RADIUS);
          from = to;
        }
        send("pointerup", from.x, from.y);
        await wait(570); await next();
        const after = snapshot().last;
        const change = after.rotation - held.rotation - draggedAngle;
        const coast = Math.atan2(Math.sin(change), Math.cos(change));
        await next();
        checks = { continues: coast > .55 && coast < .77, stops: snapshot().last.rotation === after.rotation,
          fixedCenter: after.x === held.x && after.y === held.y };
      }
      if(name==="pull") {
        send("pointerdown",181,100);await wait(350);
        for(let i=0;i<45;i++){send("pointermove",181+i*1.6,100);await wait(20);}
        const pulled=inspect().records.slice(-55);
        send("pointerup",251,100);await wait(3600);
        checks={tip:pulled.some((s)=>s.tip?.radius>PULL_RADIUS*.5),body:pulled.some((s)=>s.vx>0),
          absorbed:snapshot().last.tip===null,settled:!snapshot().active};
      }
      if(name==="cancel") {
        send("pointerdown");await wait(400);send("pointercancel");await wait(80);
        const cancelled=!inspect().contact&& !inspect().active;
        send("pointerdown");await wait(120);window.dispatchEvent(new Event("blur"));await wait(80);
        checks={cancelled,blur:!inspect().contact&&!inspect().active};
      }
      if(name==="empty") {
        send("pointerdown",2,2);await wait(250);send("pointerup",2,2);await wait(120);
        checks={noFrames:inspect().frames===before.frames,noContact:!inspect().contact};
      }
      if(name==="low-frame") {
        send("pointerdown");
        for(let i=0;i<25;i++){const until=performance.now()+55;while(performance.now()<until){/* controlled main-thread stall */}send("pointermove",80+i*2,100);await next();}
        send("pointerup");await wait(3600);
        const s=snapshot();checks={finite:Number.isFinite(s.last.center),balanced:Math.abs(s.last.signedHeight)<.05,settled:!s.active};
      }
      if(name==="burst") {
        for(let i=0;i<20;i++){send("pointerdown",100,100);await wait(24);send("pointerup",100,100);await wait(22);}
        await wait(3600);const s=snapshot();checks={settled:!s.active,noWaves:s.last.waves===0,bounded:s.last.trail<=72};
      }
      if(name==="ripples") {
        send("pointerdown",100,100);await wait(850);send("pointerup",100,100);await next();
        await wait(450);
        const first=inspect().records.at(-1);
        send("pointerdown",130,110);await wait(500);
        const held=inspect().records.at(-1);
        send("pointerup",130,110);await next();
        const together=inspect().records.at(-1);
        await wait(3600);const after=snapshot();
        checks={fromRecovery:first.waves>0&&!first.contact,retainedDuringPress:held.waves>0,
          coexist:together.waves>=2,finished:after.last.waves===0&&!after.active,
          restored:after.last.center===0&&after.last.trail===0};
      }
      setReport({name,status:Object.values(checks).every(value=>value===true)?"pass":"FAIL",
        checks,before,after:snapshot(),elapsed:Math.round(performance.now()-started),
        timeline:inspect().records.filter((_,index)=>index%6===0),
        input:"DOM-injected touch PointerEvents; real pointer capture is tested separately"});
    } catch(error) {
      setReport({name,status:"ERROR",message:error.message,stack:error.stack});
    } finally {body.setPointerCapture=originalCapture;setRunning(false);}
  }
export default function Harness() {
  const [report,setReport]=useState(null),[running,setRunning]=useState(false),[clicks,setClicks]=useState(0);
  const [history,setHistory]=useState([]);
  function reportResult(value) {
    setReport(value);
    if(value.status!=="running")setHistory(previous=>[...previous,value]);
  }
  async function suite() {
    for(const name of ["hold","edge","rub","turn","pull","cancel","empty","low-frame","burst"]) {
      await run(name,setRunning,reportResult);
    }
  }
  useEffect(()=>installButtonRipple(document.getElementById("root")),[]);
  if (new URLSearchParams(window.location.search).has("preview")) {
    return <BrowserRouter><MallangPage /></BrowserRouter>;
  }
  return <><BrowserRouter><MallangPage /></BrowserRouter>
    <aside style={{position:"fixed",right:8,bottom:8,zIndex:10,width:"min(96vw,520px)",
      maxHeight:145,overflow:"auto",padding:8,background:"#fff0f6",border:"1px solid #e5acc6",borderRadius:12}}>
      <p>개발용 입력 재현 (프로덕션 빌드 제외)</p>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <button type="button" disabled={running} onClick={suite}>suite</button>
        {["rim-transition","hold","edge","rub","turn","spin","pull","cancel","empty","low-frame","burst","ripples"].map((name)=>
          <button type="button" key={name} disabled={running} onClick={()=>run(name,setRunning,reportResult)}>{name}</button>)}
      </div>
      <button id="ordinary-test" type="button" onClick={()=>setClicks((v)=>v+1)}>일반 버튼 {clicks}</button>
      <a data-ripple-navigation href="#navigation-check">즉시 이동 링크</a>
      <pre id="qa-report" style={{whiteSpace:"pre-wrap",fontSize:12}}>{JSON.stringify(report,null,2)}</pre>
      <output id="qa-history" hidden>{JSON.stringify(history)}</output>
    </aside></>;
}

