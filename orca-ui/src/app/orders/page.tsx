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
    parsed_data: Record<string, unknown>;
  }
  

export default function Page() {
    const [orders, setOrders] = useState<Order[]>([])

  useEffect(() => {
    const fetchOrders = async () => {
      const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false })
      if (error) {
        console.error("Error fetching orders:", error)
        return
      }
      if (data) setOrders(data)
    }
    fetchOrders()
  }, [])

  return <OrdersOverview orders={orders} />
}
