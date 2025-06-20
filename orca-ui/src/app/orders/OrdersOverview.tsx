"use client";

// UI-opzet voor Order Management + Feedback Loop
// Tech: Next.js + Tailwind + Shadcn UI

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

export default function OrdersOverview({ orders }: { orders: Order[] }) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [feedbackText, setFeedbackText] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

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
    } catch (err) {
      console.error("Fout bij opslaan feedback:", err);
      alert("❌ Feedback opslaan mislukt. Is je JSON geldig?");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
      {/* Orderlijst */}
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

      {/* Order detail en feedback */}
      {selectedOrder && (
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Orderdetails</CardTitle>
            <p className="text-xs text-muted-foreground">{selectedOrder.sender}</p>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="raw" className="w-full">
              <TabsList>
                <TabsTrigger value="raw">Raw body</TabsTrigger>
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
  );
}
