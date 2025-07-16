// app/orders/page.tsx

"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import OrdersOverview from "./OrdersOverview";

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
}

interface Email {
  id: string;
  created_at: string;
  subject: string;
  sender_name: string;
  sender_email: string;
  email_body: string;
  email_body_html?: string;
  first_time_right: boolean | null;
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

export default function Page() {
    const [emails, setEmails] = useState<Email[]>([])
    const [clients, setClients] = useState<Client[]>([])
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  useEffect(() => {
    const fetchEmails = async (clientId?: string) => {
      try {
        // First get emails - filter by client_id if specified
        let emailsQuery = supabase
          .from("emails")
          .select("*, email_body_html")
          .is("deleted_at", null)
          .order("created_at", { ascending: false });
        
        if (clientId) {
          emailsQuery = emailsQuery.eq("client_id", clientId);
        }

        const { data: emailsData, error: emailsError } = await emailsQuery;

        if (emailsError) throw emailsError;
        if (!emailsData) return;

        // Get orders - filter by client_id if specified
        let ordersQuery = supabase
          .from("orders")
          .select("id, email_id, customer_name")
          .is("deleted_at", null); 
        
        if (clientId) {
          ordersQuery = ordersQuery.eq("client_id", clientId);
        }

        const { data: structuredOrders } = await ordersQuery;

        // Join orders to emails
        const emailsWithOrder = emailsData.map(email => {
          const order = structuredOrders?.find(order => order.email_id === email.id) || null;
          return { ...email, order };
        });

        // Get order lines for enrichment
        const orderIds = structuredOrders?.map(order => order.id) || [];
        
        let exportedLinesQuery = supabase
          .from("order_lines")
          .select("id, order_id, product_name, quantity, unit, is_exported")
          .is("deleted_at", null)
          .eq("is_exported", true);

        let allOrderLinesQuery = supabase
          .from("order_lines")
          .select("id, order_id, product_name, quantity, unit, is_exported")
          .is("deleted_at", null);

        // Filter order lines by order_id if we have specific orders
        if (orderIds.length > 0) {
          exportedLinesQuery = exportedLinesQuery.in("order_id", orderIds);
          allOrderLinesQuery = allOrderLinesQuery.in("order_id", orderIds);
        } else if (clientId) {
          // If we have a clientId but no orders, return empty results
          setEmails([]);
          return;
        }

        const { data: exportedLines } = await exportedLinesQuery;
        const { data: allOrderLines } = await allOrderLinesQuery;

        // Create maps for data enrichment
        const exportedProducts = new Map();
        const allOrderLinesMap = new Map();
        
        if (exportedLines && structuredOrders && allOrderLines) {
          // Create a map of structured_id to email_id for easier lookup
          const structuredToEmailMap = new Map(
            structuredOrders.map(so => [so.id, { email_id: so.email_id, customer_name: so.customer_name }])
          );

          // Group exported lines by their original email_id
          exportedLines.forEach(line => {
            const emailId = structuredToEmailMap.get(line.order_id);
            if (emailId) {
              if (!exportedProducts.has(emailId)) {
                exportedProducts.set(emailId, new Set());
              }
              const productKey = `${line.product_name}|${line.quantity}|${line.unit}`;
              exportedProducts.get(emailId).add(productKey);
            }
          });

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

        // Enrich the emails data with order_line_id from the order_lines table
        const updatedEmails = emailsWithOrder.map(email => {
          if (!email.parsed_data?.products) return email;
          
          const orderLinesForThisEmail = allOrderLinesMap.get(email.id) || [];
          const exportedProductsForThisEmail = exportedProducts.get(email.id) || new Set();
          
          return {
            ...email,
            parsed_data: {
              ...email.parsed_data,
              products: email.parsed_data.products.map((product: Product) => {
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
                
                // Check if this product is exported
                const productKey = `${product.name}|${product.quantity}|${product.unit}`;
                const isExported = exportedProductsForThisEmail.has(productKey);
                
                return {
                  ...product,
                  order_line_id: matchingOrderLine?.id || null,
                  is_exported: isExported
                };
              })
            }
          };
        });

        setEmails(updatedEmails);
      } catch (error) {
        console.error("Error fetching emails:", error);
      }
    };

    fetchEmails(selectedClient?.id);
  }, [selectedClient]);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || "http://localhost:8000";
        const res = await fetch(`${backendUrl}/clients`);
        
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const json = await res.json();
        
        if (json.clients && Array.isArray(json.clients)) {
          setClients(json.clients);
        } else {
          setClients([]);
        }
      } catch (error) {
        console.error("❌ Error fetching clients:", error);
        setClients([
          { id: "fallback", name: "Alle klanten (API niet beschikbaar)" }
        ]);
      }
    };
    fetchClients();
  }, []);

  return <OrdersOverview emails={emails} clients={clients} selectedClient={selectedClient} setSelectedClient={setSelectedClient} />
}
