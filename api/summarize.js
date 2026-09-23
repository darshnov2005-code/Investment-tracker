export default async function handler(req,res){
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  const key=process.env.OPENAI_API_KEY;
  if(!key)return res.status(503).json({error:"OPENAI_API_KEY is not available to this deployment. Save the variable in Vercel and redeploy."});
  try{
    const body=req.body||{},filename=String(body.filename||"document.pdf").slice(0,200),text=String(body.text||""),company=String(body.company||"").trim();
    if(!text.trim())return res.status(400).json({error:"No readable PDF text was received."});
    if(text.length>5000000)return res.status(413).json({error:"Extracted document is too large. Please use a shorter PDF."});
    const prompt="You are an equity-research assistant. Summarize the attached earnings transcript for an investor who does not want to read the full document.\n"+(company?"Company: "+company+"\n":"")+
      "Return a concise but detailed investment-relevant summary with these sections:\n1. Executive summary — 5-8 bullets\n2. Financial performance — revenue, EBITDA/EBIT, margins, PAT, EPS, cash flow, debt and other material figures mentioned; include YoY/QoQ changes when stated\n3. Management commentary — demand, segments, geographies, capacity, margins, competition and strategy\n4. Guidance & outlook — explicit management guidance, targets and timelines\n5. Key positives — concrete points from the transcript\n6. Key risks / concerns — concrete points from the transcript\n7. What to monitor next — 5-8 specific items for the next quarter/year\n8. Investor takeaway — a balanced factual conclusion, without giving personalized investment advice\n\nImportant: distinguish reported facts from management commentary. Do not invent numbers. If a figure is not stated, say so. Preserve units and periods exactly where possible. If management makes a claim, attribute it to management. Keep the summary substantially shorter than the source.\n\nDOCUMENT TEXT:\n"+text;
    const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5.6-luna",input:prompt,max_output_tokens:8000})});
    const d=await r.json();
    if(!r.ok){
      if(r.status===401)return res.status(401).json({error:"OpenAI API key was rejected. Check that Vercel has the correct key and redeploy."});
      if(r.status===429)return res.status(429).json({error:"OpenAI API quota/rate limit was reached. Check API billing and usage."});
      return res.status(502).json({error:d?.error?.message||"OpenAI request failed"});
    }
    const summary=d.output_text||d.output?.flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join("\n")||"";
    if(!summary)throw new Error("The AI returned an empty summary.");
    return res.status(200).json({filename,company,summary,model:"gpt-5.6-luna"});
  }catch(e){return res.status(500).json({error:"Unable to summarize PDF",detail:e?.message||"Unknown error"})}
}