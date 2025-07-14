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
  id: string; // ← eigenlijk email_id
  created_at: string;
  subject: string;
  sender_name: string;
  sender_email: string;
  email_body: string;
  email_body_html?: string; // <-- Add this line
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
  const ordersPerPage = 7;
  const [sendingOrders, setSendingOrders] = useState<Set<string>>(new Set());
  const [newlyImportedOrderIds, setNewlyImportedOrderIds] = useState<Set<string>>(new Set());
  const [promptInput, setPromptInput] = useState("");
  const [promptResult, setPromptResult] = useState<string | null>(null);
  const [promptProducts, setPromptProducts] = useState<Product[] | null>(null); // ← Nieuw
    


  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  useEffect(() => {
    if (selectedOrder) {
      const updated = orders.find((o) => o.id === selectedOrder.id);
      if (updated) {
        // Deep comparison to check if the order data has actually changed
        const hasChanged = JSON.stringify(updated) !== JSON.stringify(selectedOrder);
        if (hasChanged) {
          setSelectedOrder(updated);
        }
      }
    }
  }, [orders, selectedOrder]);

  useEffect(() => {
    if (newlyImportedOrderIds.size > 0) {
      const timeout = setTimeout(() => {
        setNewlyImportedOrderIds(new Set());
      }, 10000); // 10 seconden
  
      return () => clearTimeout(timeout);
    }
  }, [newlyImportedOrderIds]);

  const [linkedOrderId, setLinkedOrderId] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrderId = async () => {
      if (selectedOrder?.id) {
        const { data, error } = await supabase
          .from("orders")
          .select("id")
          .eq("email_id", selectedOrder.id)
          .single();

        if (!error && data?.id) {
          setLinkedOrderId(data.id);
        } else {
          console.warn("⚠️ Geen bijbehorende order gevonden bij email_id:", selectedOrder.id);
          setLinkedOrderId(null);
        }
      }
    };

    fetchOrderId();
  }, [selectedOrder]);

useEffect(() => {
  setPromptInput("");
  setPromptResult(null);
  setPromptProducts(null);
}, [selectedOrder?.id]);


  const handleProcessAll = async () => {
    setProcessing(true);
    setProcessResult(null);
  
    try {
      const res = await fetch(process.env.NEXT_PUBLIC_PROCESS_ALL_URL!, { method: "POST" });
      const json = await res.json();
  
      if (!res.ok || json.status === "error") {
        setProcessResult(`❌ Fout: ${json.message || res.status}`);
        return;
      }
  
      // ✅ Zet de status bovenaan
      setProcessResult(`📥 ${json.email?.emails_found ?? "?"} mails · 🧠 ${json.llm?.parsed ?? "?"} parsed · ✅ ${json.import?.orders_imported ?? "?"} orders`);
  
      // ✅ Als er orders zijn geïmporteerd, update de lijst
const newOrders: { id: string }[] = json.import?.new_orders ?? [];

if (newOrders.length > 0) {
  // Get all emails
  const { data: ordersData, error: ordersError } = await supabase
    .from("emails")
    .select("*")
    .order("created_at", { ascending: false });

  if (ordersError) throw ordersError;
  if (!ordersData) return;

  // Get ALL order lines to enrich the JSON with IDs
  const { data: allOrderLines } = await supabase
    .from("order_lines")
    .select("id, order_id, product_name, quantity, unit, is_exported");

  // Get the mapping of email_id to order_id
  const { data: structuredOrders } = await supabase
    .from("orders")
    .select("id, email_id");

  // Create a map of all order lines for enriching JSON with IDs
  const allOrderLinesMap = new Map();
  
  if (allOrderLines && structuredOrders) {
    // Create a map of structured_id to email_id for easier lookup
    const structuredToEmailMap = new Map(
      structuredOrders.map(so => [so.id, so.email_id])
    );

    // Group ALL order lines by email_id for enriching JSON
    allOrderLines.forEach(line => {
      const emailId = structuredToEmailMap.get(line.order_id);
      if (emailId) {
        if (!allOrderLinesMap.has(emailId)) {
          allOrderLinesMap.set(emailId, []);
        }
        allOrderLinesMap.get(emailId).push(line);
      }
    });
  }

  // Enrich the orders data with order_line_id from the order_lines table
  const updatedOrders = ordersData.map(order => {
    if (!order.parsed_data?.products) return order;
    
    const orderLinesForThisOrder = allOrderLinesMap.get(order.id) || [];
    
    return {
      ...order,
      parsed_data: {
        ...order.parsed_data,
        products: order.parsed_data.products.map((product: {
          name: string;
          quantity: number;
          unit: string;
          delivery_date?: string;
          is_exported?: boolean;
          order_line_id?: string | null;
        }) => {
          // Try to find the matching order line for this product
          const matchingOrderLine = orderLinesForThisOrder.find((line: {
            id: string;
            order_id: string;
            product_name: string;
            quantity: number;
            unit: string;
            is_exported: boolean;
          }) => 
            line.product_name === product.name &&
            line.quantity === product.quantity &&
            line.unit === product.unit
          );
          
          return {
            ...product,
            order_line_id: matchingOrderLine?.id || null,
            is_exported: matchingOrderLine?.is_exported || false
          };
        })
      }
    };
  });

  const newIds = new Set(newOrders.map((o) => o.id));
  setOrders(updatedOrders as Order[]);
  setNewlyImportedOrderIds(newIds);
  
  // Update selectedOrder if it's one of the newly imported orders
  if (selectedOrder && newIds.has(selectedOrder.id)) {
    const updatedSelectedOrder = updatedOrders.find((o) => o.id === selectedOrder.id);
    if (updatedSelectedOrder) {
      console.log('🔄 Updating selected order with fresh data from database');
      setSelectedOrder(updatedSelectedOrder as Order);
    }
  }
}
  
    } catch (err) {
      console.error("❌ Fout bij het verwerken van de nieuwe e-mails:", err);
      setProcessResult("❌ Fout bij verbinden met backend");
    } finally {
      setProcessing(false);
    }
  };
  

  const handleSendOrder = async (product: Product, index: number) => {
    if (!product.delivery_date || !product.order_line_id) {
      console.log('❌ Cannot send order: missing delivery_date or order_line_id', { 
        delivery_date: product.delivery_date, 
        order_line_id: product.order_line_id 
      });
      return;
    }
    const key = product.order_line_id;
    setSendingOrders((prev) => new Set(prev).add(key));

    try {
      const res = await fetch(process.env.NEXT_PUBLIC_SEND_TO_TRELLO_URL!, {
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
        {order.sender_name || order.sender_email} • {new Date(order.created_at).toLocaleString()}
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
                <CardTitle className="text-base">Email Details</CardTitle>
                <p className="text-xs text-muted-foreground">
                  From: {selectedOrder.sender_name || selectedOrder.sender_email}
                </p>
              </CardHeader>
              <CardContent>
                {selectedOrder.email_body_html ? (
                  <div
                    className="email-preview h-[80vh] font-mono text-xs overflow-auto border rounded p-2 bg-white"
                    dangerouslySetInnerHTML={{ __html: selectedOrder.email_body_html }}
                  />
                ) : (
                  <Textarea value={selectedOrder.email_body} className="h-[80vh] font-mono text-xs" readOnly />
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {selectedOrder && (
          <div className="col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gestructureerde Order</CardTitle>
                <p className="text-xs text-muted-foreground">{selectedOrder.sender_name || selectedOrder.sender_email}</p>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="lines" className="w-full">
                  <TabsList>
                    <TabsTrigger value="lines">Producten per dag</TabsTrigger>
                    <TabsTrigger value="parsed">JSON</TabsTrigger>
                    <TabsTrigger value="feedback">Feedback</TabsTrigger>
                    <TabsTrigger value="prompt">Test Prompt</TabsTrigger>
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
                  <TabsContent value="prompt">
  <form
    onSubmit={async (e) => {
      e.preventDefault();
      if (!selectedOrder) return;

      const promptText = promptInput.trim();
      if (!promptText) return alert("Prompt mag niet leeg zijn");

      setPromptResult("⏳ Versturen...");

      try {
        const res = await fetch("/api/test-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: promptText,
            email_body: selectedOrder.email_body,
            parsed_data: selectedOrder.parsed_data,
          }),
        });

        const json = await res.json();
        console.log("✅ API response:", json);
        setPromptResult(json.result || "");

        try {
          const parsed = JSON.parse(json.result || "{}");
          if (parsed.products) {
            setPromptProducts(parsed.products);
          } else {
            setPromptProducts(null);
          }
        } catch {
          setPromptProducts(null);
        }
      } catch (err) {
        console.error("❌ API error:", err);
        setPromptResult("❌ Er ging iets mis bij het uitvoeren van de prompt.");
      }
    }}
    className="space-y-4"
  >
    <Textarea
      value={promptInput}
      onChange={(e) => setPromptInput(e.target.value)}
      placeholder="Voeg hier extra prompt toe (bijv: 'Zet leverdatum op dinsdag')"
      className="h-32 font-mono text-xs"
    />
    <Button type="submit">Voer prompt uit</Button>

    {/* Weergave van AI-gegenereerde producten per dag */}
    {promptProducts && promptProducts.length > 0 && (
      <div className="space-y-3 mt-4">
        {Object.entries(groupedProductsByDate(promptProducts)).map(([date, products]) => (
          <div key={date}>
            <h4 className="font-semibold text-sm mb-1">🧠 AI: {date}</h4>
            {products.map((p, i) => (
              <div key={i} className="flex justify-between text-sm border-b py-1">
                <span>{p.name}</span>
                <span>{p.quantity} {p.unit}</span>
              </div>
            ))}
          </div>
        ))}

        {/* Update-knop */}
        <Button
  variant="secondary"
  onClick={async () => {
    if (!selectedOrder?.id || !promptResult) return;

    try {
      const parsed = JSON.parse(promptResult);
      parsed.order_id = linkedOrderId ?? selectedOrder.id;// ✅ Voeg order_id toe aan parsed_data

      const body = {
        order_id: linkedOrderId,
        parsed_data: parsed,
      };

      console.log("📤 Verstuur naar Python /update-order:", body);

      const res = await fetch("http://localhost:10000/update-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (res.ok) {
        alert("✅ Order succesvol geüpdatet");
        console.log("✅ Response van Python:", json);
      } else {
        console.error("❌ Fout bij Python-update:", json);
        alert(`❌ Python kon order niet updaten (${res.status}): ${json.message}`);
      }
    } catch (err) {
      console.error("❌ Netwerkfout naar Python:", err);
      alert("❌ Kon geen verbinding maken met de Python-backend");
    }
  }}
>
  Update Order
</Button>


{/* JSON preview */}
<div className="mt-4 space-y-2">
  <h4 className="text-sm font-semibold">🔍 Volledige JSON (inclusief order_id)</h4>
  <pre className="bg-gray-100 border border-gray-300 rounded p-4 text-xs font-mono whitespace-pre-wrap overflow-auto">
    {(() => {
      try {
        const parsed = JSON.parse(promptResult || "{}");
        if (selectedOrder?.id) {
          parsed.order_id = linkedOrderId ?? selectedOrder.id; // ✅ ook zichtbaar in de preview
        }
        return JSON.stringify(parsed, null, 2);
      } catch {
        return promptResult;
      }
    })()}
  </pre>
</div>

      </div>
    )}

    {/* Fallback bij geen producten of JSON error */}
    {!promptProducts && promptResult && typeof promptResult === "string" && (
      <Textarea
        value={promptResult}
        readOnly
        className="h-64 font-mono text-xs mt-4 border border-red-300"
      />
    )}
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