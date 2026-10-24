// Bounded planning on an existing sensitive-round skeleton; no cards are invented.
(function(root){
    'use strict';
    async function solve(rows, o) {
        const n=rows.length, needed=Math.max(0,o.signals-o.free), maxStates=o.maxStates||2400;
        const suffix=new Array(n+1).fill(0), swapSuffix=new Array(n+1).fill(0);
        for(let i=n-1;i>=0;i--){suffix[i]=suffix[i+1]+Math.max(0,...rows[i].map(x=>x.cap));swapSuffix[i]=swapSuffix[i+1]+Math.max(0,...rows[i].map(x=>x.swap));}
        if(o.signals<o.minB)return {ok:false,reason:'訊號張數不足以支援可行莊局目標',nodes:0};
        if(suffix[0]+o.free<o.signals)return {ok:false,reason:'可用訊號局的0點容量不足以容納全部訊號牌',nodes:0};
        let states=[{b:0,cap:0,b6:0,seven:0,rare:0,last:-1000,swap:0,side:'',run:0,blocks:0,flips:0}];
        let truncated=false,nodes=0,deadline=performance.now()+8;
        await new Promise(r=>setTimeout(r,0));
        for(let i=0;i<n;i++){
            if(o.shouldStop?.())return {cancelled:true};
            const next=new Map();
            for(const s of states)for(const x of rows[i]){
                nodes++;
                const b=s.b+(x.result==='莊'),cap=Math.min(needed,s.cap+x.cap);
                if(b>o.maxB||b+n-i-1<o.minB||b>o.signals||cap+suffix[i+1]<needed)continue;
                const b6=o.b6Max==null?0:s.b6+x.b6,seven=o.sevenMax==null?0:s.seven+x.seven;
                const rare=o.rareMax==null?0:s.rare+x.rare;
                if(b6>(o.b6Max??Infinity)||seven>(o.sevenMax??Infinity)||rare>(o.rareMax??Infinity))continue;
                if(o.rareMax!=null&&x.rare&&i-s.last-1<=20)continue;
                const last=o.rareMax!=null&&x.rare?i:s.last;
                const swap=Math.min(o.swapMin||0,s.swap+x.swap);
                if(o.swapMax!=null&&x.swap>o.swapMax)continue;
                if(swap+swapSuffix[i+1]<(o.swapMin||0))continue;
                const same=x.result!=='和'&&x.result===s.side,run=x.result==='和'?0:same?s.run+1:1;
                const blocks=s.blocks+(run===5?1:0);
                if(run>=8||blocks>2)continue;
                const t={b,cap,b6,seven,rare,last,swap,side:x.result,run,blocks,flips:s.flips+x.flip,prev:s,choice:x};
                const key=[b,cap,b6,seven,rare,last,swap,t.side,run,blocks].join('/');
                if(!next.has(key)||next.get(key).flips>t.flips)next.set(key,t);
            }
            states=[...next.values()];
            if(!states.length)return {ok:false,reason:`第${i+1}局後無符合庫存、勝負與已啟用限制的配置`,nodes,truncated};
            if(states.length>maxStates){
                truncated=true;
                states.sort((a,b)=>b.cap-a.cap||b.swap-a.swap||a.flips-b.flips||Math.abs(a.b-(i+1)/2)-Math.abs(b.b-(i+1)/2));
                states.length=maxStates;
            }
            if(performance.now()>=deadline){await new Promise(r=>setTimeout(r,0));deadline=performance.now()+8;}
        }
        const finals=states.filter(s=>s.b>=o.minB&&s.b<=o.maxB&&s.cap>=needed&&s.swap>=(o.swapMin||0));
        finals.sort((a,b)=>Math.abs(2*a.b-n)-Math.abs(2*b.b-n)||a.flips-b.flips);
        if(!finals.length)return {ok:false,reason:'有界搜尋未找到可容納全部訊號牌且達到莊局目標的配置',nodes,truncated};
        const choices=[];for(let s=finals[0];s.prev;s=s.prev)choices.push(s.choice);
        return {ok:true,choices:choices.reverse(),banker:finals[0].b,nodes,truncated};
    }
    root.Red0Balance={solve};
    if(typeof module!=='undefined')module.exports=root.Red0Balance;
})(typeof window!=='undefined'?window:globalThis);
