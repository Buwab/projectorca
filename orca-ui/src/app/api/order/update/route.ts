import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

export async function POST(req: Request) {
  try {
    const { order_id, parsed_data } = await req.json();

    if (!order_id || !parsed_data) {
      return NextResponse.json({ error: "order_id of parsed_data ontbreekt" }, { status: 400 });
    }

    // Stap 1: bestaande regels ophalen
    const { data: existingLinesRaw, error: fetchError } = await supabase
      .from("order_lines")
      .select("*")
      .eq("order_id", order_id);

    if (fetchError) {
      throw fetchError;
    }

    const existingLines: any[] = existingLinesRaw || [];
    const existingById = new Map(existingLines.map((line) => [line.id, line]));

    // Stap 2: input mappen
    const newLines = parsed_data.products || [];
    const incomingIds = new Set(newLines.map((l: any) => l.order_line_id).filter(Boolean));

    let updated = 0;
    let inserted = 0;
    let skipped = 0;

    // Hulpfunctie voor robuuste vergelijking
    const normalize = (v: any) => v === undefined ? null : v;

    // Stap 3: update of insert
    for (const line of newLines) {
      const existingId = line.order_line_id;
      const old = existingById.get(existingId);

      if (existingId && old) {
        const isDifferent =
          normalize(old.product_name) !== normalize(line.name) ||
          Number(old.quantity) !== Number(line.quantity) ||
          normalize(old.unit) !== normalize(line.unit) ||
          (old.delivery_date ? old.delivery_date.toString().slice(0, 10) : null) !==
          (line.delivery_date ? line.delivery_date.toString().slice(0, 10) : null);

        if (isDifferent) {
          await supabase.from("order_lines").update({
            product_name: line.name,
            quantity: line.quantity,
            unit: line.unit,
            delivery_date: line.delivery_date,
            source: "user",
            updated_at: new Date().toISOString(),
          }).eq("id", existingId);

          updated++;
        } else {
          skipped++;
        }
      } else {
        await supabase.from("order_lines").insert({
          order_id,
          product_name: line.name,
          quantity: line.quantity,
          unit: line.unit,
          delivery_date: line.delivery_date,
          source: "user",
          is_latest: true,
          is_exported: false,
        });

        inserted++;
      }
    }

    // Stap 4: oude regels deactiveren
    const toDeactivate = existingLines.filter((line) => !incomingIds.has(line.id));

    for (const line of toDeactivate) {
      await supabase
        .from("order_lines")
        .update({ is_latest: false, updated_at: new Date().toISOString() })
        .eq("id", line.id);
    }

    return NextResponse.json({
      message: `✅ Verwerkt: ${inserted} nieuw, ${updated} aangepast, ${skipped} overgeslagen, ${toDeactivate.length} gedeactiveerd`,
    });
  } catch (error) {
    console.error("❌ Fout in /api/order/update:", error);
    return NextResponse.json({ error: "Interne fout" }, { status: 500 });
  }
}
