"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabaseClient";

interface Product {
  name: string;
  quantity: number;
  unit: string;
}

interface ParsedData {
  products?: Product[];
  [key: string]: unknown;
}

interface Order {
  id: string;
  created_at: string;
  subject: string;
  sender: string;
  email_body: string;
  parsed_data: ParsedData;
}

export default function OrdersOverview({ orders: initialOrders }: { orders: Order[] }) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [feedbackText, setFeedbackText] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<string | null>(null);

  const fetchOrders = async () => {
    const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (data) setOrders(data as Order[]);
    if (error) console.error("Fout bij ophalen orders:", error);
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setSubmitting(true);
    try {
      const parsedCorrection = feedbackText ? JSON.parse(feedbackText) : null;
      await supabase.from("order_feedback").insert({
        order_id: selectedOrder.id,
        original_data: selectedOrder.parsed_data,
        corrected_data: parsedCorrection,
        feedback_text: feedbackText,
      });
      alert("Feedback opgeslagen ✔");
      setFeedbackText("");
    } catch {
      alert("❌ Feedback opslaan mislukt. Is je JSON geldig?");
    } finally {
      setSubmitting(false);
    }
  };

  const handleProcessAll = async () => {
    setProcessing(true);
    setProcessResult(null);
    try {
      const res = await fetch("https://projectorca.onrender.com/process-all", { method: "POST" });
      const json = await res.json();
      if (json.status === "error") {
        setProcessResult(`❌ Fout: ${json.message}`);
      } else {
        setProcessResult(
          `📥 ${json.email.emails_found} mails · 🧠 ${json.llm.parsed} parsed · ✅ ${json.import.orders_imported} orders`
        );
        await fetchOrders();
      }
    } catch {
      setProcessResult("❌ Fout bij verbinden met backend");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-semibold">Orders</h1>
        <div className="flex flex-col items-end">
          <Button onClick={handleProcessAll} disabled={processing}>
            {processing ? "Bezig..." : "Nieuwe e-mails ophalen"}
          </Button>
          {processResult && <span className="text-xs mt-1 text-muted-foreground">{processResult}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          {orders.map((order) => (
            <Card key={order.id} onClick={() => setSelectedOrder(order)} className="cursor-pointer">
              <CardHeader>
                <CardTitle className="text-sm">{order.subject}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {order.sender} • {new Date(order.created_at).toLocaleString()}
                </p>
              </CardHeader>
            </Card>
          ))}
        </div>

        {selectedOrder && (
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Orderdetails</CardTitle>
              <p className="text-xs text-muted-foreground">{selectedOrder.sender}</p>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="raw" className="w-full">
                <TabsList>
                  <TabsTrigger value="raw">Rauw body</TabsTrigger>
                  <TabsTrigger value="parsed">Parsed JSON</TabsTrigger>
                  <TabsTrigger value="lines">Orderregels</TabsTrigger>
                  <TabsTrigger value="feedback">Feedback</TabsTrigger>
                </TabsList>

                <TabsContent value="raw">
                  <Textarea value={selectedOrder.email_body} className="h-64 font-mono text-xs" readOnly />
                </TabsContent>

                <TabsContent value="parsed">
                  <Textarea
                    value={JSON.stringify(selectedOrder.parsed_data, null, 2)}
                    className="h-64 font-mono text-xs"
                    readOnly
                  />
                </TabsContent>

                <TabsContent value="lines">
                  {selectedOrder.parsed_data?.products?.map((p, i) => (
                    <div key={i} className="flex justify-between text-sm border-b py-1">
                      <span>{p.name}</span>
                      <span>
                        {p.quantity} {p.unit}
                      </span>
                    </div>
                  )) || <p className="text-xs italic">Geen regels gevonden.</p>}
                </TabsContent>

                <TabsContent value="feedback">
                  <form className="space-y-2" onSubmit={handleFeedbackSubmit}>
                    <Textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Correctie op parsed_data als JSON... (optioneel)"
                      className="h-40 font-mono text-xs"
                    />
                    <Button type="submit" disabled={submitting}>
                      {submitting ? "Versturen..." : "Verbeter model"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
