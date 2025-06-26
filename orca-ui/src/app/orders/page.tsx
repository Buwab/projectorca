// app/orders/page.tsx

"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import OrdersOverview from "./OrdersOverview";

interface Order {
    id: string;
    created_at: string;
    subject: string;
    sender: string;
    email_body: string;
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
  
// Helper function to normalize product names for comparison
function normalizeProductName(name: string): string {
  return name.toLowerCase()
    .replace(/zaden\s+/, '') // Remove 'zaden' prefix
    .replace(/en\s+/, '')    // Remove 'en' joining word
    .replace(/s$/, '')       // Remove trailing 's' for plurals
    .trim();
}

export default function Page() {
    const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        // First get all orders
        const { data: ordersData, error: ordersError } = await supabase
          .from("orders")
          .select("*")
          .order("created_at", { ascending: false });

        if (ordersError) throw ordersError;
        if (!ordersData) return;

        // Get all exported order lines with more details for debugging
        const { data: exportedLines } = await supabase
          .from("order_lines")
          .select("id, order_id, product_name, quantity, unit, is_exported")
          .eq("is_exported", true);

        // Get ALL order lines (not just exported ones) to enrich the JSON with IDs
        const { data: allOrderLines } = await supabase
          .from("order_lines")
          .select("id, order_id, product_name, quantity, unit, is_exported");

        // Get the mapping of email_id to structured_order_id
        const { data: structuredOrders } = await supabase
          .from("orders_structured")
          .select("id, email_id");

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

        // Update orders with correct export status AND enrich with order_lines.id
        const updatedOrders = ordersData.map(order => {
          if (!order.parsed_data?.products) return order;

          const exportedProductsForOrder = exportedProducts.get(order.id) || new Set();
          const orderLinesForOrder = allOrderLinesMap.get(order.id) || [];
          
          return {
            ...order,
            parsed_data: {
              ...order.parsed_data,
              products: order.parsed_data.products.map(product => {
                // Create the same specific key for matching
                const productKey = `${product.name}|${product.quantity}|${product.unit}`;
                const isExported = exportedProductsForOrder.has(productKey);
                
                // Find the corresponding order_line to get the ID
                const matchingOrderLine = orderLinesForOrder.find(line => 
                  line.product_name === product.name &&
                  line.quantity === product.quantity &&
                  line.unit === product.unit
                );
                
                return {
                  ...product,
                  is_exported: isExported,
                  order_line_id: matchingOrderLine?.id || null // Add the order_lines.id
                };
              })
            }
          };
        });

        setOrders(updatedOrders);
      } catch (error) {
        console.error("Error fetching orders:", error);
      }
    };

    fetchOrders();
  }, []);

  return <OrdersOverview orders={orders} />
}
