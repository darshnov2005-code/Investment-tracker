export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});

  const key=process.env.GEMINI_API_KEY;
  if(!key)return res.status(503).json({error:"GEMINI_API_KEY is not available to this deployment. Add it in Vercel Environment Variables and redeploy."});

  try{
    const body=req.body||{};
    const filename=String(body.filename||"document.pdf").slice(0,200);
    const text=String(body.text||"");
    const company=String(body.company||"").trim();

    if(!text.trim())return res.status(400).json({error:"No readable PDF text was received."});
    if(text.length>3500000)return res.status(413).json({error:"Extracted document is too large. Please use a shorter PDF or split the transcript."});

    const prompt="You are an equity-research assistant. Summarize this earnings transcript for an investor who does not want to read the full document.\n"+
      (company?"Company: "+company+"\n":"")+
      "Return ONLY a valid JSON object. Do not return markdown, headings, commentary, or prose outside the JSON. The JSON must contain ALL of these keys: executive_summary, financial_performance, management_commentary, guidance_outlook, key_positives, key_risks, what_to_monitor_next, investor_takeaway. Every key must be populated from the document; use [] only when the document genuinely contains no relevant information. Each section must be independent and must NOT repeat the entire document.\n"+
      "1. Executive summary — 5-6 concise bullets covering only the most important overall developments.\n"+
      "2. Financial performance — 5-8 concise bullets containing ONLY reported financial numbers and changes: revenue, EBITDA/EBIT, margins, PAT, EPS, cash flow, debt, capex and segment performance. Include period and YoY/QoQ change whenever stated. Do not put these figures in executive_summary unless they are essential.\n"+
      "3. Management commentary — 4-7 concise bullets covering management's comments on demand, segments, geographies, capacity, margins, competition and strategy. Clearly attribute statements to management.\n"+
      "4. Guidance & outlook — 3-6 concise bullets containing ONLY explicit guidance, targets, expected growth/margins/capex and timelines stated by management. If guidance is not provided, say that clearly.\n"+
      "5. Key positives — 4-6 short, evidence-based bullets. Do not simply repeat financial performance.\n"+
      "6. Key risks / concerns — concrete points from the transcript\n"+
      "7. What to monitor next — 5-8 specific forward-looking items that an investor should track in the next quarter/year, based only on the document.\n"+
      "8. Investor takeaway — 3-5 concise balanced bullets summarising what the transcript indicates, without personalized investment advice.\n\n"+
      "Important: distinguish reported facts from management commentary. Do not invent numbers. If a figure is not stated, say so. Preserve units and periods exactly where possible. If management makes a claim, attribute it to management. Keep the summary substantially shorter than the source.\n\n"+
      "DOCUMENT TEXT:\n"+text;

    const url="https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key="+encodeURIComponent(key);
    const r=await fetch(url,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        contents:[{role:"user",parts:[{text:prompt}]}],
        generationConfig:{maxOutputTokens:8000,responseMimeType:"application/json"}
      })
    });

    const d=await r.json();

    if(!r.ok){
      if(r.status===400)return res.status(400).json({error:d?.error?.message||"Gemini rejected the request. Check the API key, model and document size."});
      if(r.status===401||r.status===403)return res.status(401).json({error:"Gemini API key was rejected. Check GEMINI_API_KEY in Vercel and redeploy."});
      if(r.status===429)return res.status(429).json({error:"Gemini free-tier rate limit was reached. Wait a little and try again."});
      return res.status(502).json({error:d?.error?.message||"Gemini request failed"});
    }

    const raw=(d.candidates||[]).flatMap(c=>c.content?.parts||[]).filter(p=>typeof p.text==="string").map(p=>p.text).join("\n").trim();
    if(!raw)throw new Error("Gemini returned an empty summary.");
    let summary;
    try{
      const cleaned=raw.replace(/^\s*\`\`\`json\s*/i,"").replace(/\s*\`\`\`\s*$/,"").trim();
      summary=JSON.parse(cleaned);
    }catch(_){
      summary={executive_summary:[raw],financial_performance:[],management_commentary:"",guidance_outlook:"",key_positives:[],key_risks:[],what_to_monitor_next:[],investor_takeaway:""};
    }
    const keys=["executive_summary","financial_performance","management_commentary","guidance_outlook","key_positives","key_risks","what_to_monitor_next","investor_takeaway"];
    const normalized={};
    keys.forEach(k=>{const v=summary?.[k];normalized[k]=Array.isArray(v)?v.filter(x=>String(x||"").trim()).map(x=>String(x).replace(/^[•*-]\s*/,"").trim()):String(v||"").trim()});
    return res.status(200).json({filename,company,summary:normalized,model:"gemini-3.8-flash"});
  }catch(e){
    return res.status(500).json({error:"Unable to summarize PDF",detail:e?.message||"Unknown error"});
  }
}