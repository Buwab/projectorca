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
// import { Loader2 } from "lucide-react"; // COMMENTED OUT - used for Trello buttons

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
  sender_name: string;
  sender_email: string;
  first_time_right: boolean | null;
  email_body: string;
  email_body_html?: string; // <-- Add this line
  parsed_data: {
    products?: Product[];
    [key: string]: unknown;
  };
}

interface Client {
  id: string;
  name: string;
}

export default function OrdersOverview({ 
  orders: initialOrders, 
  clients, 
  selectedClient, 
  setSelectedClient 
}: { 
  orders: Order[], 
  clients: Client[], 
  selectedClient: Client | null, 
  setSelectedClient: (client: Client | null) => void 
}) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [feedbackText, setFeedbackText] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ordersPerPage = 7;
  // const [sendingOrders, setSendingOrders] = useState<Set<string>>(new Set()); // COMMENTED OUT - used for Trello buttons
  const [newlyImportedOrderIds, setNewlyImportedOrderIds] = useState<Set<string>>(new Set());

  const generateClipboardText = (products: Product[], customerName: string) => {
    if (!products?.length) return "";
    const items = products.map(
      (p) => `${p.quantity}× ${p.unit} ${p.name}`
    );
    return `${customerName}: ${items.join(", ")}`;
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('nl-NL', {
      weekday: 'long', // "maandag"
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert("✔️ Gekopieerd naar klembord");
    }).catch(() => {
      alert("❌ Mislukt met kopiëren");
    });
  };


  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  // Clear selected order when client changes
  useEffect(() => {
    setSelectedOrder(null);
  }, [selectedClient]);

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

const handleSetFirstTimeRight = async (isRight: boolean) => {
  if (!selectedOrder) return;
  setSubmitting(true);
  try {
    // Update in Supabase
    await supabase
      .from("orders")
      .update({ first_time_right: isRight })
      .eq("id", selectedOrder.id);

    // ✅ Update in state
    setOrders((prevOrders) =>
      prevOrders.map((order) =>
        order.id === selectedOrder.id
          ? { ...order, first_time_right: isRight }
          : order
      )
    );

    // ✅ Update geselecteerde order ook los
    setSelectedOrder((prev) =>
      prev ? { ...prev, first_time_right: isRight } : null
    );

    alert("✔ Eerste keer goed uitgelezen status bijgewerkt");
  } catch (err) {
    console.error("❌ Fout bij bijwerken:", err);
    alert("❌ Fout bij bijwerken status");
  } finally {
    setSubmitting(false);
  }
};

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
  

  // TRELLO SEND ORDER FUNCTION - TEMPORARILY COMMENTED OUT
  /* const handleSendOrder = async (product: Product, index: number) => {
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
  }; */

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
      {/* Full-width client selection bar at the top */}
      <div className="bg-gray-50 p-3 rounded-lg mb-4 flex justify-end">
        <div>
          <label className="mr-2 text-sm font-medium">Selecteer klant:</label>
          <select
            value={selectedClient ? selectedClient.id : ''}
            onChange={e => {
              const client = clients.find(c => c.id === e.target.value) || null;
              setSelectedClient(client);
            }}
            className="border rounded px-2 py-1 text-sm font-medium"
          >
            <option value="">Toon alles</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </div>
      </div>
      
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
                <CardTitle className="text-base">Resultaat email orders</CardTitle>
                <p className="text-xs text-muted-foreground">Klant: {selectedOrder.sender_name || selectedOrder.sender_email}</p>
                <p className="text-xs text-muted-foreground">
                Datum: {formatDate(selectedOrder.created_at)}
                </p>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="lines" className="w-full">
                  <TabsList>
                    <TabsTrigger value="lines">Producten per dag</TabsTrigger>
                  {/*   <TabsTrigger value="parsed">JSON</TabsTrigger>*/}
                  {/*   <TabsTrigger value="feedback">Feedback</TabsTrigger>*/}
                  </TabsList>

                  <TabsContent value="lines">

                    {selectedOrder.parsed_data?.products ? (
                      Object.entries(groupedProductsByDate(selectedOrder.parsed_data.products)).map(
                        ([date, products]) => (
                          <div key={date} className="mb-3">
                            <h4 className="font-semibold text-sm mb-1">🗓 {date}</h4>
                            {products.map((p, i) => {
                              // Use order_line_id as the unique key for this specific product
                              // const productKey = p.order_line_id; // COMMENTED OUT - used for Trello buttons
                              
                              return (
                                <div key={i} className="flex justify-between text-sm border-b py-1">
                                  <span>{p.name}</span>
                                  <span>
                                    {p.quantity} {p.unit}
                                                                         {/* TRELLO PUSH BUTTONS - TEMPORARILY HIDDEN */}
                                     {/* {p.delivery_date && (
                                        <Button 
                                          variant={p.is_exported ? "ghost" : "outline"} 
                                          size="icon"
                                          className="ml-2 h-6 w-6 hover:bg-slate-100"
                                          onClick={() => handleSendOrder(p, i)}
                                          disabled={!!p.is_exported || (!!p.order_line_id && sendingOrders.has(p.order_line_id))}
                                        >
                                          {p.is_exported ? (
                                            "✅"
                                          ) : (p.order_line_id && sendingOrders.has(p.order_line_id)) ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            "📤"
                                          )}
                                        </Button>
                                      )} */}
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
                    <br></br>
                  {selectedOrder.id && selectedOrder.first_time_right === null && (
  <div className="flex items-center justify-between mt-4 p-3 border rounded-md bg-muted">
    <span className="text-sm font-medium">📩 Was deze e-mail in één keer goed uitgelezen?</span>
    <div className="space-x-2">
      <Button 
        variant="outline"
        size="sm"
        onClick={() => handleSetFirstTimeRight(true)}
      >
        ✅ Ja
      </Button>
      <Button 
        variant="outline"
        size="sm"
        onClick={() => handleSetFirstTimeRight(false)}
      >
        ❌ Nee
      </Button>
    </div>
  </div>
)}

<br></br>
                    {selectedOrder.parsed_data?.products && selectedOrder.parsed_data.products.length > 0 && (
                    <div className="flex justify-end mb-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const text = generateClipboardText(
                                selectedOrder.parsed_data.products!,
                                selectedOrder.sender_name || selectedOrder.sender_email
                              );
                              copyToClipboard(text);
                            }}
                          >
                            📋 Kopieer bestelling!
                          </Button>
                        </div>
                      )}
                  </TabsContent>

                  <TabsContent value="parsed">
                    <Textarea
                      value={JSON.stringify(selectedOrder.parsed_data, null, 2)}
                      className="h-64 font-mono text-xs"
                      readOnly
                    />
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