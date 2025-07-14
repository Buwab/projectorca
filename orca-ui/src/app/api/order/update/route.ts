import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

interface IncomingLine {
  name: string;
  quantity: number;
  unit: string;
  delivery_date?: string | null;
  order_line_id?: string | null;
}

interface ExistingLine {
  id: string;
  product_name: string;
  quantity: number;
  unit: string;
  delivery_date: string | null;
  is_latest: boolean;
  order_id: string;
}

const normalize = (v: any) => (v === undefined ? null : v);
const formatDate = (d: string | null | undefined) => d?.slice(0, 10) ?? null;

export async function POST(req: Request) {
  try {
    const { order_id, parsed_data } = await req.json();

    if (!order_id || !parsed_data?.products) {
      return NextResponse.json({ error: "order_id of parsed_data ontbreekt" }, { status: 400 });
    }

    const incomingLines: IncomingLine[] = parsed_data.products;

    // Stap 1: haal bestaande order_lines (alleen actuele versies)
    const { data: existingRaw, error: fetchError } = await supabase
      .from("order_lines")
      .select("*")
      .eq("order_id", order_id)
      .eq("is_latest", true);

    if (fetchError) throw fetchError;

    const existingLines: ExistingLine[] = existingRaw || [];

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let deactivated = 0;

    const matchedIds = new Set<string>();

    for (const incoming of incomingLines) {
      const matched = existingLines.find((existing) => {
        if (
          incoming.order_line_id && incoming.order_line_id === existing.id
        ) {
          return true;
        }
        // Fallback: inhoudelijke match
        return (
          normalize(existing.product_name) === normalize(incoming.name) &&
          Number(existing.quantity) === Number(incoming.quantity) &&
          normalize(existing.unit) === normalize(incoming.unit) &&
          formatDate(existing.delivery_date) === formatDate(incoming.delivery_date)
        );
      });

      if (matched) {
        matchedIds.add(matched.id);

        // Check of inhoudelijk verschillend
        const isDifferent =
          normalize(matched.product_name) !== normalize(incoming.name) ||
          Number(matched.quantity) !== Number(incoming.quantity) ||
          normalize(matched.unit) !== normalize(incoming.unit) ||
          formatDate(matched.delivery_date) !== formatDate(incoming.delivery_date);

        if (isDifferent) {
          await supabase.from("order_lines").update({
            product_name: incoming.name,
            quantity: incoming.quantity,
            unit: incoming.unit,
            delivery_date: incoming.delivery_date ?? null,
            source: "user",
            updated_at: new Date().toISOString(),
          }).eq("id", matched.id);
          updated++;
        } else {
          skipped++;
        }
      } else {
        // Nieuw toevoegen
        await supabase.from("order_lines").insert({
          order_id,
          product_name: incoming.name,
          quantity: incoming.quantity,
          unit: incoming.unit,
          delivery_date: incoming.delivery_date ?? null,
          source: "user",
          is_latest: true,
          is_exported: false,
        });
        inserted++;
      }
    }

    // Stap 2: alles wat niet gematcht is, op inactive zetten
    const toDeactivate = existingLines.filter((line) => !matchedIds.has(line.id));

    for (const line of toDeactivate) {
      await supabase.from("order_lines").update({
        is_latest: false,
        updated_at: new Date().toISOString(),
      }).eq("id", line.id);
      deactivated++;
    }

    return NextResponse.json({
      message: `✅ Verwerkt: ${inserted} nieuw, ${updated} aangepast, ${skipped} ongewijzigd, ${deactivated} gedeactiveerd`
    });

  } catch (err) {
    console.error("❌ Fout in update:", err);
    return NextResponse.json({ error: "Interne serverfout" }, { status: 500 });
  }
}
