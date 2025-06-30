"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { supabase } from "@/lib/supabaseClient";
import { Loader2 } from "lucide-react";

interface Product {
  name: string;
  quantity: number;
  unit: string;
  delivery_date?: string;
  is_exported?: boolean;
  order_line_id?: string | null;
}

interface Order {
  id: string;
  created_at: string;
  subject: string;
  sender: string;
  email_body: string;
  parsed_data: {
    products?: Product[];
    [key: string]: unknown;
  };
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
  const [sendingOrders, setSendingOrders] = useState<Set<string>>(new Set());
  const [newlyImportedOrderIds, setNewlyImportedOrderIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  useEffect(() => {
    if (selectedOrder) {
      const updated = orders.find((o) => o.id === selectedOrder.id);
      if (updated && updated !== selectedOrder) {
        setSelectedOrder(updated);
      }
    }
  }, [orders, selectedOrder]);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("emails")
        .select("*")
        .order("created_at", { ascending: false });
  
      if (error) throw error;
  
      if (data) {
        const newIds = new Set<string>();
        const oldIds = new Set(orders.map((o) => o.id));
  
        for (const o of data) {
          if (!oldIds.has(o.id)) {
            newIds.add(o.id);
          }
        }
  
        setOrders(data as Order[]);
        setNewlyImportedOrderIds(newIds);
      }
    } catch (err) {
      console.error("❌ Error fetching orders:", err);
    }
  };
  const handleProcessAll = async () => {
    setProcessing(true);
    setProcessResult(null);

    try {
      const res = await fetch("https://projectorca.onrender.com/process-all", { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.status === "error") {
        setProcessResult(`❌ Fout: ${json.message || res.status}`);
        return;
      }
      setProcessResult(`📥 ${json.email?.emails_found ?? "?"} mails · 🧠 ${json.llm?.parsed ?? "?"} parsed · ✅ ${json.import?.orders_imported ?? "?"} orders`);
      await fetchOrders();
    } catch (err) {
      console.error("❌ Fout bij verwerken:", err);
      setProcessResult("❌ Fout bij verbinden met backend");
    } finally {
      setProcessing(false);
    }
  };

  const handleSendOrder = async (product: Product, index: number) => {
    if (!product.delivery_date || !product.order_line_id) return;
    const key = product.order_line_id;
    setSendingOrders((prev) => new Set(prev).add(key));

    try {
      const res = await fetch("https://projectorca.onrender.com/send-to-trello", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: selectedOrder?.id, product, product_index: index }),
      });
      const result = await res.json();
      if (!res.ok || result.status !== "success") throw new Error(result.message);

      setOrders((prev) =>
        prev.map((order) =>
          order.id === selectedOrder?.id
            ? {
                ...order,
                parsed_data: {
                  ...order.parsed_data,
                  products: order.parsed_data.products?.map((p) =>
                    p.order_line_id === key ? { ...p, is_exported: true } : p
                  ),
                },
              }
            : order
        )
      );
    } catch (err) {
      alert("❌ Versturen mislukt: " + (err instanceof Error ? err.message : "Onbekende fout"));
    } finally {
      setSendingOrders((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setSubmitting(true);
    try {
      const corrected = feedbackText ? JSON.parse(feedbackText) : null;
      await supabase.from("order_feedback").insert({
        order_id: selectedOrder.id,
        original_data: selectedOrder.parsed_data,
        corrected_data: corrected,
        feedback_text: feedbackText,
      });
      alert("✔ Feedback opgeslagen");
      setFeedbackText("");
    } catch {
      alert("❌ Feedback opslaan mislukt. Is je JSON geldig?");
    } finally {
      setSubmitting(false);
    }
  };

  const groupedProductsByDate = (products: Product[]) => {
    const grouped: Record<string, Product[]> = {};
    for (const p of products) {
      const date = p.delivery_date || "Onbekende datum";
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(p);
    }
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
  <Card 
    key={order.id} 
    onClick={() => setSelectedOrder(order)} 
    className={`cursor-pointer transition-shadow duration-200 ease-in-out hover:transition-all border-2 shadow-none
               hover:shadow-lg hover:shadow-gray-300 hover:border-gray-400 hover:bg-gray-100/60
               active:scale-[0.98] active:shadow-sm active:bg-gray-100/50
               ${selectedOrder?.id === order.id ? 'border-gray-800 bg-gray-50/50 shadow-md' : 'border-gray-200'}
               `}
  >
    <CardHeader>
                <CardTitle className="text-sm">
              {order.subject}
              {newlyImportedOrderIds.has(order.id) && <span className="ml-2 text-blue-500 text-xs">🆕 Nieuw</span>}
            </CardTitle>
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
                            {products.map((p, i) => {
                              // Use order_line_id as the unique key for this specific product
                              const productKey = p.order_line_id;
                              
                              return (
                                <div key={i} className="flex justify-between text-sm border-b py-1">
                                  <span>{p.name}</span>
                                  <span>
                                    {p.quantity} {p.unit}
                                    {p.delivery_date && (
                                      <Button 
                                        variant={p.is_exported ? "ghost" : "outline"} 
                                        size="icon"
                                        className="ml-2 h-6 w-6 hover:bg-slate-100"
                                        onClick={() => handleSendOrder(p, i)}
                                        disabled={!!p.is_exported || (!!productKey && sendingOrders.has(productKey))}
                                      >
                                        {p.is_exported ? (
                                          "✅"
                                        ) : (productKey && sendingOrders.has(productKey)) ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          "📤"
                                        )}
                                      </Button>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
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
