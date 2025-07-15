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
  email_id: string;
  customer_name: string;
  // add other fields from orders table if needed
}

interface Email {
  id: string;
  created_at: string;
  subject: string;
  sender_name: string;
  sender_email: string;
  first_time_right: boolean | null;
  email_body: string;
  email_body_html?: string; // <-- Add this line
  customer_name?: string; // <-- Add this line
  parsed_data: {
    products?: Product[];
    [key: string]: unknown;
  };
  order?: Order;
}

interface Client {
  id: string;
  name: string;
}

export default function OrdersOverview({ 
  emails: initialEmails, 
  clients, 
  selectedClient, 
  setSelectedClient 
}: { 
  emails: Email[], 
  clients: Client[], 
  selectedClient: Client | null, 
  setSelectedClient: (client: Client | null) => void 
}) {
  const [emails, setEmails] = useState<Email[]>(initialEmails);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const emailsPerPage = 7;
  // const [sendingOrders, setSendingOrders] = useState<Set<string>>(new Set()); // COMMENTED OUT - used for Trello buttons
  const [newlyImportedEmailIds, setNewlyImportedEmailIds] = useState<Set<string>>(new Set());
  const [feedbackText, setFeedbackText] = useState<string>("");

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
    setEmails(initialEmails);
  }, [initialEmails]);

  // Clear selected email when client changes
  useEffect(() => {
    setSelectedEmail(null);
  }, [selectedClient]);

  useEffect(() => {
    if (selectedEmail) {
      const updated = emails.find((e) => e.id === selectedEmail.id);
      if (updated) {
        // Deep comparison to check if the email data has actually changed
        const hasChanged = JSON.stringify(updated) !== JSON.stringify(selectedEmail);
        if (hasChanged) {
          setSelectedEmail(updated);
        }
      }
    }
  }, [emails, selectedEmail]);

  useEffect(() => {
    if (newlyImportedEmailIds.size > 0) {
      const timeout = setTimeout(() => {
        setNewlyImportedEmailIds(new Set());
      }, 10000); // 10 seconden
  
      return () => clearTimeout(timeout);
    }
  }, [newlyImportedEmailIds]);



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
const newEmails: { id: string }[] = json.import?.new_orders ?? [];

if (newEmails.length > 0) {
  // Get all emails
  const { data: emailsData, error: emailsError } = await supabase
    .from("emails")
    .select("*")
    .order("created_at", { ascending: false });

  if (emailsError) throw emailsError;
  if (!emailsData) return;
    


  // Get ALL order lines to enrich the JSON with IDs
  const { data: allOrderLines } = await supabase
    .from("order_lines")
    .select("id, order_id, product_name, quantity, unit, is_exported");

  // Get the mapping of email_id to order_id
  const { data: structuredEmails } = await supabase
    .from("orders")
    .select("id, email_id, customer_name");


  // Create a map of all order lines for enriching JSON with IDs
  const allOrderLinesMap = new Map();
  
  if (allOrderLines && structuredEmails) {
    // Create a map of structured_id to email_id for easier lookup
    const structuredToEmailMap = new Map(
      structuredEmails.map(so => [so.id, { email_id: so.email_id, customer_name: so.customer_name }])
    );
    
    // Group ALL order lines by email_id for enriching JSON
        allOrderLines.forEach(line => {
      const mapping = structuredToEmailMap.get(line.order_id);
      if (mapping) {
        const { email_id, customer_name } = mapping;
        if (!allOrderLinesMap.has(email_id)) {
          allOrderLinesMap.set(email_id, { lines: [], customer_name });
        }
        allOrderLinesMap.get(email_id).lines.push(line);
      }
    });
  }

  // Enrich the orders data with order_line_id from the order_lines table
  const updatedEmails = emailsData.map(email => {
    if (!email.parsed_data?.products) return email;
    
    const orderLinesForThisEmail = allOrderLinesMap.get(email.id) || [];
    
    return {
      ...email,
      parsed_data: {
        ...email.parsed_data,
        products: email.parsed_data.products.map((product: {
          name: string;
          quantity: number;
          unit: string;
          delivery_date?: string;
          is_exported?: boolean;
          order_line_id?: string | null;
        }) => {
          // Try to find the matching order line for this product
          const matchingOrderLine = orderLinesForThisEmail.find((line: {
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

  const newIds = new Set(newEmails.map((e) => e.id));
  setEmails(updatedEmails as Email[]);
  setNewlyImportedEmailIds(newIds);
  
  // Update selectedEmail if it's one of the newly imported emails
  if (selectedEmail && newIds.has(selectedEmail.id)) {
    const updatedSelectedEmail = updatedEmails.find((e) => e.id === selectedEmail.id);
    if (updatedSelectedEmail) {
      console.log('🔄 Updating selected email with fresh data from database');
      setSelectedEmail(updatedSelectedEmail as Email);
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

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmail) return;
    setSubmitting(true);
    try {
      const corrected = feedbackText ? JSON.parse(feedbackText) : null;
      await supabase.from("order_feedback").insert({
        order_id: selectedEmail.id,
        original_data: selectedEmail.parsed_data,
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

  const totalPages = Math.ceil(emails.length / emailsPerPage);

  const sortedEmails = [...emails].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const paginatedEmails = sortedEmails.slice((currentPage - 1) * emailsPerPage, currentPage * emailsPerPage);

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
        {paginatedEmails.map((email) => (
  <Card 
    key={email.id} 
    onClick={() => setSelectedEmail(email)} 
    className={`cursor-pointer transition-shadow duration-200 ease-in-out hover:transition-all border-2 shadow-none
               hover:shadow-lg hover:shadow-gray-300 hover:border-gray-400 hover:bg-gray-100/60
               active:scale-[0.98] active:shadow-sm active:bg-gray-100/50
               ${selectedEmail?.id === email.id ? 'border-gray-800 bg-gray-50/50 shadow-md' : 'border-gray-200'}
               `}
  >
    <CardHeader>
                <CardTitle className="text-sm">
              {email.subject}
              {newlyImportedEmailIds.has(email.id) && <span className="ml-2 text-blue-500 text-xs">🆕 Nieuw</span>}
            </CardTitle>
      <p className="text-xs text-muted-foreground">
        {email.order?.customer_name || email.sender_name || email.sender_email} • {new Date(email.created_at).toLocaleString()}
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

        {selectedEmail && (
          <div className="col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Email Details</CardTitle>
                <p className="text-xs text-muted-foreground">
                  From: {selectedEmail.sender_name || selectedEmail.sender_email}
                </p>
              </CardHeader>
              <CardContent>
                {selectedEmail.email_body_html ? (
                  <div
                    className="email-preview h-[80vh] font-mono text-xs overflow-auto border rounded p-2 bg-white"
                    dangerouslySetInnerHTML={{ __html: selectedEmail.email_body_html }}
                  />
                ) : (
                  <Textarea value={selectedEmail.email_body} className="h-[80vh] font-mono text-xs" readOnly />
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {selectedEmail && (
          <div className="col-span-1">
            <Card>
            <CardHeader>
                <CardTitle className="text-base">Resultaat email orders</CardTitle>
                <p className="text-xs text-muted-foreground">Klant: {selectedEmail.order?.customer_name || selectedEmail.sender_name || selectedEmail.sender_email}</p>
                <p className="text-xs text-muted-foreground">
                Datum: {formatDate(selectedEmail.created_at)}
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

                    {selectedEmail.parsed_data?.products ? (
                      Object.entries(groupedProductsByDate(selectedEmail.parsed_data.products)).map(
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
                    {selectedEmail.parsed_data?.products && selectedEmail.parsed_data.products.length > 0 && (
                    <div className="flex justify-end mb-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const text = generateClipboardText(
                                selectedEmail.parsed_data.products!,
                                selectedEmail.order?.customer_name || selectedEmail.sender_name || selectedEmail.sender_email
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
                      value={JSON.stringify(selectedEmail.parsed_data, null, 2)}
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