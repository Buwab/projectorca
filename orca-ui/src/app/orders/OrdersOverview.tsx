"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabaseClient";
import React from "react";
import { Loader2 } from "lucide-react";



interface Product {
  name: string;
  quantity: number;
  unit: string;
  delivery_date?: string;
  is_exported?: boolean;
  order_line_id?: string | null;
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
  const [sendingOrders, setSendingOrders] = useState<Set<string>>(new Set());

  // Sync with parent component when initialOrders changes
  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);



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
        // Trigger a page refresh to get updated data through the parent component
        window.location.reload();
      }
    } catch {
      setProcessResult("❌ Fout bij verbinden met backend");
    } finally {
      setProcessing(false);
    }
  };

  const handleSendOrder = async (product: Product, productIndex: number) => {
    if (!product.delivery_date) return;
    
    // Create a unique key for this specific product using its properties
    const productKey = `${selectedOrder?.id}-${product.name}-${product.quantity}-${product.unit}-${product.delivery_date}`;
    setSendingOrders(prev => new Set(prev).add(productKey));
    
    try {
      console.log('Attempting to send order:', {
        order_id: selectedOrder?.id,
        product,
        product_index: productIndex
      });

      const response = await fetch("http://localhost:8005/send-to-trello", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          order_id: selectedOrder?.id,
          product,
          product_index: productIndex
        }),
      });

      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('Response data:', result);

      if (!response.ok) {
        throw new Error(`Failed to send order: ${response.statusText}. Details: ${JSON.stringify(result)}`);
      }

      if (result.status === "success") {
        // First: Immediately update the UI for instant feedback using order_line_id
        setOrders(prevOrders => {
          return prevOrders.map(order => {
            if (order.id !== selectedOrder?.id || !order.parsed_data?.products) return order;
            
            return {
              ...order,
              parsed_data: {
                ...order.parsed_data,
                products: order.parsed_data.products.map((p) => {
                  // Update the specific product that was just sent using its order_line_id
                  if (p.order_line_id && p.order_line_id === product.order_line_id) {
                    return {
                      ...p,
                      is_exported: true
                    };
                  }
                  return p;
                })
              }
            };
          });
        });

        // Second: Sync with database in the background for consistency
        // Get all exported order lines
        const { data: exportedLines } = await supabase
          .from("order_lines")
          .select("order_id, product_name, quantity, unit")
          .eq("is_exported", true);

        // Get the mapping of email_id to structured_order_id
        const { data: structuredOrders } = await supabase
          .from("orders_structured")
          .select("id, email_id");

        if (exportedLines && structuredOrders) {
          // Create a map of structured_id to email_id for easier lookup
          const structuredToEmailMap = new Map(
            structuredOrders.map(so => [so.id, so.email_id])
          );

          // Create a map of email_ids to their exported products
          const exportedProducts = new Map();
          exportedLines.forEach(line => {
            const emailId = structuredToEmailMap.get(line.order_id);
            if (emailId) {
              if (!exportedProducts.has(emailId)) {
                exportedProducts.set(emailId, new Set());
              }
              // Create a more specific key: "product_name|quantity|unit"
              const productKey = `${line.product_name}|${line.quantity}|${line.unit}`;
              exportedProducts.get(emailId).add(productKey);
            }
          });

          // Update orders state with database truth (this will override the immediate update if needed)
          setOrders(prevOrders => {
            return prevOrders.map(order => {
              if (!order.parsed_data?.products) return order;

              const exportedProductsForOrder = exportedProducts.get(order.id) || new Set();
              
              return {
                ...order,
                parsed_data: {
                  ...order.parsed_data,
                  products: order.parsed_data.products.map(p => {
                    // Create the same specific key for matching
                    const productKey = `${p.name}|${p.quantity}|${p.unit}`;
                    const isExported = exportedProductsForOrder.has(productKey);
                    return {
                      ...p,
                      is_exported: isExported
                    };
                  })
                }
              };
            });
          });
        }
      } else {
        throw new Error(result.message || "Failed to send order to Trello");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      console.error("Error sending order:", {
        error,
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      alert("Failed to send order to Trello. Please try again. Error: " + errorMessage);
    } finally {
      setSendingOrders(prev => {
        const next = new Set(prev);
        next.delete(productKey);
        return next;
      });
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
                            {products.map((p, i) => {
                              // Create the same unique key for this specific product
                              const productKey = `${selectedOrder?.id}-${p.name}-${p.quantity}-${p.unit}-${p.delivery_date}`;
                              
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
                                        disabled={p.is_exported || sendingOrders.has(productKey)}
                                      >
                                        {p.is_exported ? (
                                          "✅"
                                        ) : sendingOrders.has(productKey) ? (
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
