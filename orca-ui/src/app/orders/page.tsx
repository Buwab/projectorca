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

    fetchOrders();
  }, []);

  return <OrdersOverview orders={orders} />
}
