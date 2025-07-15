// app/orders/page.tsx

"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import OrdersOverview from "./OrdersOverview";

interface Order {
    id: string;
    created_at: string;
    subject: string;
    sender_name: string;
    sender_email: string;
    email_body: string;
    email_body_html?: string; // <-- Add this line
    parsed_data: {
      products?: {
        name: string;
        quantity: number;
        unit: string;
        delivery_date?: string;
        is_exported?: boolean;
        order_line_id?: string | null;
      }[];
      [key: string]: unknown;
    };
  }
  

interface Client {
  id: string;
  name: string;
}

export default function Page() {
    const [orders, setOrders] = useState<Order[]>([])
    const [clients, setClients] = useState<Client[]>([])
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  useEffect(() => {
    const fetchOrders = async (clientId?: string) => {
      try {
        // First get emails - filter by client_id if specified
        let emailsQuery = supabase
          .from("emails")
          .select("*, email_body_html")
          .order("created_at", { ascending: false });
        
        if (clientId) {
          emailsQuery = emailsQuery.eq("client_id", clientId);
        }

        const { data: ordersData, error: ordersError } = await emailsQuery;

        if (ordersError) throw ordersError;
        if (!ordersData) return;

        // Get orders - filter by client_id if specified
        let ordersQuery = supabase
          .from("orders")
          .select("id, email_id");
        
        if (clientId) {
          ordersQuery = ordersQuery.eq("client_id", clientId);
        }

        const { data: structuredOrders } = await ordersQuery;

        // Get order lines - these will be automatically filtered by the orders above
        const orderIds = structuredOrders?.map(order => order.id) || [];
        
        let exportedLinesQuery = supabase
          .from("order_lines")
          .select("id, order_id, product_name, quantity, unit, is_exported")
          .eq("is_exported", true);

        let allOrderLinesQuery = supabase
          .from("order_lines")
          .select("id, order_id, product_name, quantity, unit, is_exported");

        // Filter order lines by order_id if we have specific orders
        if (orderIds.length > 0) {
          exportedLinesQuery = exportedLinesQuery.in("order_id", orderIds);
          allOrderLinesQuery = allOrderLinesQuery.in("order_id", orderIds);
        } else if (clientId) {
          // If we have a clientId but no orders, return empty results
          setOrders([]);
          return;
        }

        const { data: exportedLines } = await exportedLinesQuery;
        const { data: allOrderLines } = await allOrderLinesQuery;

        // Create a map of structured order IDs to their exported products
        const exportedProducts = new Map();
        // Create a map of all order lines for enriching JSON with IDs
        const allOrderLinesMap = new Map();
        
        if (exportedLines && structuredOrders && allOrderLines) {
          // Create a map of structured_id to email_id for easier lookup
          const structuredToEmailMap = new Map(
            structuredOrders.map(so => [so.id, so.email_id])
          );

          // Group exported lines by their original email_id with more specific matching
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
        console.log('Starting data enrichment...');
        console.log('Total orders:', ordersData.length);
        console.log('All order lines map:', allOrderLinesMap);
        
        const updatedOrders = ordersData.map(order => {
          if (!order.parsed_data?.products) return order;
          
          const orderLinesForThisOrder = allOrderLinesMap.get(order.id) || [];
          const exportedProductsForThisOrder = exportedProducts.get(order.id) || new Set();
          
          console.log(`Processing order ${order.id}:`, {
            orderLinesCount: orderLinesForThisOrder.length,
            productsCount: order.parsed_data.products.length,
            orderLines: orderLinesForThisOrder
          });
          
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
                console.log(`Looking for match for product:`, product);
                console.log(`Available order lines:`, orderLinesForThisOrder);
                
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
                
                console.log(`Matching order line found:`, matchingOrderLine);
                
                // Check if this product is exported
                const productKey = `${product.name}|${product.quantity}|${product.unit}`;
                const isExported = exportedProductsForThisOrder.has(productKey);
                
                const enrichedProduct = {
                  ...product,
                  order_line_id: matchingOrderLine?.id || null,
                  is_exported: isExported
                };
                
                console.log(`Enriched product:`, enrichedProduct);
                return enrichedProduct;
              })
            }
          };
        });

        setOrders(updatedOrders);
      } catch (error) {
        console.error("Error fetching orders:", error);
      }
    };

    fetchOrders(selectedClient?.id);
  }, [selectedClient]);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        // Use environment variable for backend URL, fallback to localhost for dev
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_BASE_URL || "http://localhost:8000";
        console.log("🔍 Fetching clients from:", backendUrl);
        console.log("🌍 Environment variable NEXT_PUBLIC_BACKEND_BASE_URL:", process.env.NEXT_PUBLIC_BACKEND_BASE_URL);
        
        const res = await fetch(`${backendUrl}/clients`);
        console.log("📡 Response status:", res.status);
        console.log("📡 Response ok:", res.ok);
        
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const json = await res.json();
        console.log("📦 Received data:", json);
        
        if (json.clients && Array.isArray(json.clients)) {
          console.log("✅ Successfully loaded clients:", json.clients);
          setClients(json.clients);
        } else {
          console.warn("⚠️ No clients data received, using fallback");
          setClients([]); // Set empty array as fallback
        }
      } catch (error) {
        console.error("❌ Error fetching clients:", error);
        console.error("❌ Error details:", {
          name: error instanceof Error ? error.name : 'Unknown',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        // Provide fallback clients data if API fails
        setClients([
          { id: "fallback", name: "Alle klanten (API niet beschikbaar)" }
        ]);
      }
    };
    fetchClients();
  }, []);

  return <OrdersOverview orders={orders} clients={clients} selectedClient={selectedClient} setSelectedClient={setSelectedClient} />
}
