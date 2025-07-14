import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prompt, parsed_data } = body;

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content:
          "Je bent een JSON-editor voor bestellingen. Je krijgt bestaande parsed_data van een bestelling. Pas deze JSON aan volgens de instructie van de gebruiker. Geef alleen geldige JSON terug, zonder uitleg.",
      },
      {
        role: "user",
        content: `Bewerk deze JSON volgens de volgende prompt: "${prompt}".\n\nJSON:\n${JSON.stringify(parsed_data)}`,
      },
    ],
    temperature: 0.2,
  });

  const result = response.choices[0].message.content;

  return NextResponse.json({ result });
}
