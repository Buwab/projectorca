"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabaseClient";

interface Product {
  name: string;
  quantity: number;
  unit: string;
  delivery_date?: string;
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
  const [currentPage, setCurrentPage] = useState(1);
  const ordersPerPage = 50;

  const fetchOrders = async () => {
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (data) setOrders(data as Order[]);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

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
      alert("❌ Feedback opslaan mislukt. Is je JSON wel geldig?");
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
        setProcessResult(`📥 ${json.email.emails_found} mails · 🧠 ${json.llm.parsed} parsed · ✅ ${json.import.orders_imported} orders`);
        await fetchOrders();
      }
    } catch {
      setProcessResult("❌ Fout bij verbinden met backend");
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateTrelloCard = async () => {
    if (!selectedOrder) return;
    try {
      const res = await fetch("https://projectorca.onrender.com/create-trello-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: selectedOrder.id }),
      });
      const json = await res.json();
      if (json.success) {
        alert("📋 Trello-kaartje aangemaakt!");
      } else {
        alert("❌ Maken Trello-kaartje mislukt.");
      }
    } catch (error) {
      alert("❌ Fout bij verbinden met Trello-service");
    }
  };

  const groupedProductsByDate = (products: Product[]) => {
    const grouped: Record<string, Product[]> = {};
    products.forEach((p) => {
      const date = p.delivery_date || "Onbekende datum";
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(p);
    });
    return grouped;
  };

  const totalPages = Math.ceil(orders.length / ordersPerPage);
  const sortedOrders = [...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const paginatedOrders = sortedOrders.slice((currentPage - 1) * ordersPerPage, currentPage * ordersPerPage);

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-semibold">Orders</h1>
        <div className="flex flex-col items-end">
          <Button onClick={handleProcessAll} disabled={processing}>
            {processing ? "Bezig..." : "Nieuwe e-mails verwerken"}
          </Button>
          {processResult && <span className="text-xs mt-1 text-muted-foreground">{processResult}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2 max-h-[80vh] overflow-auto">
          {paginatedOrders.map((order) => (
            <Card key={order.id} onClick={() => setSelectedOrder(order)} className="cursor-pointer">
              <CardHeader>
                <CardTitle className="text-sm">{order.subject}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {order.sender} • {new Date(order.created_at).toLocaleString()}
                </p>
              </CardHeader>
            </Card>
          ))}
          <div className="flex justify-between mt-4">
            <Button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
              ← Vorige
            </Button>
            <span className="text-sm">Pagina {currentPage} van {totalPages}</span>
            <Button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
              Volgende →
            </Button>
          </div>
        </div>

        {selectedOrder && (
          <div className="col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Raw Email Body</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea value={selectedOrder.email_body} className="h-[80vh] font-mono text-xs" readOnly />
              </CardContent>
            </Card>
          </div>
        )}

        {selectedOrder && (
          <div className="col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gestructureerde Order</CardTitle>
                <p className="text-xs text-muted-foreground">{selectedOrder.sender}</p>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="lines" className="w-full">
                  <TabsList>
                    <TabsTrigger value="lines">Producten per dag</TabsTrigger>
                    <TabsTrigger value="parsed">JSON</TabsTrigger>
                    <TabsTrigger value="feedback">Feedback</TabsTrigger>
                  </TabsList>

                  <TabsContent value="lines">
                    {selectedOrder.parsed_data?.products ? (
                      Object.entries(groupedProductsByDate(selectedOrder.parsed_data.products)).map(
                        ([date, products]) => (
                          <div key={date} className="mb-3">
                            <h4 className="font-semibold text-sm mb-1">🗓 {date}</h4>
                            {products.map((p, i) => (
                              <div key={i} className="flex justify-between text-sm border-b py-1">
                                <span>{p.name}</span>
                                <span>
                                  {p.quantity} {p.unit}
                                </span>
                              </div>
                            ))}
                          </div>
                        )
                      )
                    ) : (
                      <p className="text-xs italic">Geen regels gevonden.</p>
                    )}
                  </TabsContent>

                  <TabsContent value="parsed">
                    <Textarea
                      value={JSON.stringify(selectedOrder.parsed_data, null, 2)}
                      className="h-64 font-mono text-xs"
                      readOnly
                    />
                  </TabsContent>

                  <TabsContent value="feedback">
                    <form className="space-y-2" onSubmit={handleFeedbackSubmit}>
                      <Textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        placeholder="Correctie op parsed_data als JSON... (optioneel)"
                        className="h-40 font-mono text-xs"
                      />
                      <div className="flex gap-2">
                        <Button type="submit" disabled={submitting}>
                          {submitting ? "Versturen..." : "Verbeter model"}
                        </Button>
                        <Button type="button" variant="outline" onClick={handleCreateTrelloCard}>
                          📋 Trello kaartje
                        </Button>
                      </div>
                    </form>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
